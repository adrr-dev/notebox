// Package handlers exposes the workspace REST API.
//
// Error contract: failures answer {"error":{"code","message","issues?}}.
// Every mutating endpoint validates before touching the database and writes in a
// single transaction, so a rejected payload can never leave a partial graph.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/art/notebox/backend/internal/models"
	"github.com/art/notebox/backend/internal/schema"
	"github.com/art/notebox/backend/internal/service"
	"github.com/art/notebox/backend/internal/store"
)

// API binds HTTP endpoints to the store.
type API struct {
	Store *store.Store
}

// New creates the handler set.
func New(s *store.Store) *API { return &API{Store: s} }

// Register installs the routes on the given router group.
func (a *API) Register(api *gin.RouterGroup) {
	api.GET("/health", a.Health)
	api.GET("/workspaces", a.ListWorkspaces)
	api.POST("/workspaces", a.CreateWorkspace)
	api.GET("/workspaces/:id", a.GetWorkspace)
	api.PUT("/workspaces/:id/graph", a.PutGraph)
	api.GET("/workspaces/:id/export", a.ExportWorkspace)
	api.POST("/workspaces/:id/import", a.ImportWorkspace)
	api.GET("/workspaces/:id/snapshots", a.ListSnapshots)
	api.POST("/workspaces/:id/snapshots", a.CreateSnapshot)
	api.GET("/workspaces/:id/snapshots/:snapshotId", a.GetSnapshot)
	api.DELETE("/workspaces/:id/snapshots/:snapshotId", a.DeleteSnapshot)
}

// Health reports server liveness and schema versions the client should expect.
func (a *API) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":                "ok",
		"app":                   schema.App,
		"formatVersion":         schema.FormatVersion,
		"knowledgeModelVersion": schema.KnowledgeModelVersionCurrent,
		"time":                  time.Now().UTC().Format(time.RFC3339),
	})
}

// ListWorkspaces returns every workspace with counts.
func (a *API) ListWorkspaces(c *gin.Context) {
	workspaces, err := a.Store.ListWorkspaces(c.Request.Context())
	if err != nil {
		respondError(c, http.StatusInternalServerError, "list_failed", err.Error(), nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"workspaces": workspaces})
}

// CreateWorkspace creates an empty workspace.
func (a *API) CreateWorkspace(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil && !errors.Is(err, io.EOF) {
		respondError(c, http.StatusBadRequest, "invalid_body", "Body JSON tidak valid.", nil)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Ruang Informasi 3D"
	}
	ws, err := a.Store.CreateWorkspace(c.Request.Context(), name)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "create_failed", err.Error(), nil)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"workspace": ws})
}

// GetWorkspace returns the complete workspace state the client boots from.
func (a *API) GetWorkspace(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	graph, err := a.Store.LoadGraph(c.Request.Context(), ws)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "load_failed", err.Error(), nil)
		return
	}
	full := models.WorkspaceFull{Workspace: *ws, Nodes: graph.Nodes, Edges: graph.Edges}
	if full.Nodes == nil {
		full.Nodes = []models.Node{}
	}
	if full.Edges == nil {
		full.Edges = []models.Edge{}
	}
	c.JSON(http.StatusOK, full)
}

// PutGraph replaces the workspace graph with the posted state.
func (a *API) PutGraph(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, schema.MaxPayloadBytes)
	var payload schema.GraphPayload
	if err := json.NewDecoder(c.Request.Body).Decode(&payload); err != nil {
		respondError(c, http.StatusBadRequest, "invalid_body", "Payload graf tidak dapat dibaca: "+err.Error(), nil)
		return
	}
	if issues := schema.ValidateGraph(payload.Nodes, payload.Edges); schema.HasErrors(issues) {
		respondError(c, http.StatusBadRequest, "validation_failed", "Payload graf tidak lolos validasi.", issues)
		return
	}
	version := payload.KnowledgeModelVersion
	if version <= 0 {
		version = schema.KnowledgeModelVersionCurrent
	}
	graph := service.WorkspaceGraph{
		KnowledgeModelVersion: version,
		Nodes:                 payload.Nodes,
		Edges:                 payload.Edges,
		Trash:                 payload.Trash,
		EpistemicHistory:      payload.EpistemicHistory,
		LearningEpisodes:      payload.LearningEpisodes,
		ActionCycles:          payload.ActionCycles,
		Camera:                payload.Camera,
		Tour:                  payload.Tour,
		Fase2:                 payload.Fase2,
	}
	if graph.Nodes == nil {
		graph.Nodes = []models.Node{}
	}
	if graph.Edges == nil {
		graph.Edges = []models.Edge{}
	}
	if err := a.Store.SaveGraph(c.Request.Context(), ws, graph); err != nil {
		respondError(c, http.StatusInternalServerError, "save_failed", err.Error(), nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"nodes":     len(graph.Nodes),
		"edges":     len(graph.Edges),
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

// ExportWorkspace renders the legacy-compatible export envelope.
func (a *API) ExportWorkspace(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	graph, err := a.Store.LoadGraph(c.Request.Context(), ws)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "load_failed", err.Error(), nil)
		return
	}
	envelope := service.BuildEnvelope(*graph, "all")
	filename := fmt.Sprintf("ruang-informasi-3d_semua_%s.json", time.Now().Format("20060102-1504"))
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.JSON(http.StatusOK, envelope)
}

// ImportWorkspace merges or replaces workspace content from an envelope.
func (a *API) ImportWorkspace(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	opts := service.ImportOptions{
		Mode:  service.ImportMode(c.DefaultQuery("mode", string(service.ImportReplace))),
		Rule:  service.PlacementRule(c.DefaultQuery("rule", string(service.PlaceOriginal))),
		Avoid: c.DefaultQuery("avoid", "false") == "true",
	}
	opts.DX = queryFloat(c, "dx")
	opts.DY = queryFloat(c, "dy")
	opts.DZ = queryFloat(c, "dz")

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, schema.MaxPayloadBytes)
	var envelope schema.Envelope
	if err := json.NewDecoder(c.Request.Body).Decode(&envelope); err != nil {
		respondError(c, http.StatusBadRequest, "invalid_body", "Berkas tidak dapat dibaca sebagai JSON ekspor: "+err.Error(), nil)
		return
	}
	if envelope.App != "" && envelope.App != schema.App {
		respondError(c, http.StatusBadRequest, "wrong_app", fmt.Sprintf("Berkas ini milik aplikasi '%s', bukan '%s'.", envelope.App, schema.App), nil)
		return
	}

	graph, err := a.Store.LoadGraph(c.Request.Context(), ws)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "load_failed", err.Error(), nil)
		return
	}
	plan, err := service.PlanImport(*graph, envelope, opts)
	if err != nil {
		var validation *schema.ValidationError
		if errors.As(err, &validation) {
			respondError(c, http.StatusBadRequest, "validation_failed", "Berkas tidak lolos validasi.", validation.Issues)
			return
		}
		respondError(c, http.StatusBadRequest, "import_rejected", err.Error(), nil)
		return
	}

	if opts.Mode == service.ImportReplace {
		// Safety net: keep the previous state before it is overwritten.
		previous := service.BuildEnvelope(*graph, "all")
		if payload, err := json.Marshal(previous); err == nil {
			_, _ = a.Store.CreateSnapshot(c.Request.Context(), ws.ID, 1, "pre-import", payload)
		}
	}

	next := service.WorkspaceGraph{
		KnowledgeModelVersion: schema.KnowledgeModelVersionCurrent,
		Nodes:                 plan.Nodes,
		Edges:                 plan.Edges,
		Trash:                 plan.Trash,
		EpistemicHistory:      plan.Epistemic,
		LearningEpisodes:      plan.Episodes,
		ActionCycles:          plan.Actions,
		Camera:                plan.Camera,
		Tour:                  plan.Tour,
		Fase2:                 plan.Fase2,
	}
	if err := a.Store.SaveGraph(c.Request.Context(), ws, next); err != nil {
		respondError(c, http.StatusInternalServerError, "save_failed", err.Error(), nil)
		return
	}

	result := gin.H{
		"mode":       string(opts.Mode),
		"rule":       string(opts.Rule),
		"addedNodes": plan.AddedNodes,
		"addedEdges": plan.AddedEdges,
		"remapped":   plan.Remapped,
		"warnings":   plan.Warnings,
		"nodeCount":  len(plan.Nodes),
		"edgeCount":  len(plan.Edges),
		"exportedAt": envelope.ExportedAt,
		"scope":      envelope.Scope,
	}
	if plan.MigratedFrom > 0 {
		result["migratedFromKnowledgeModelVersion"] = plan.MigratedFrom
		result["knowledgeModelVersion"] = schema.KnowledgeModelVersionCurrent
	}
	c.JSON(http.StatusOK, result)
}

// ListSnapshots returns recovery points, newest first.
func (a *API) ListSnapshots(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "0"))
	snapshots, err := a.Store.ListSnapshots(c.Request.Context(), ws.ID, limit)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "list_failed", err.Error(), nil)
		return
	}
	if snapshots == nil {
		snapshots = []models.Snapshot{}
	}
	c.JSON(http.StatusOK, gin.H{"snapshots": snapshots})
}

// CreateSnapshot stores a recovery point. When no payload is posted the current
// workspace is serialized.
func (a *API) CreateSnapshot(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, schema.MaxPayloadBytes)
	var body struct {
		Reason          string      `json:"reason"`
		AutosaveVersion int         `json:"autosaveVersion"`
		Payload         models.JSON `json:"payload"`
	}
	if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		respondError(c, http.StatusBadRequest, "invalid_body", "Body JSON tidak valid.", nil)
		return
	}
	payload := body.Payload
	if payload.IsNull() {
		graph, err := a.Store.LoadGraph(c.Request.Context(), ws)
		if err != nil {
			respondError(c, http.StatusInternalServerError, "load_failed", err.Error(), nil)
			return
		}
		envelope := service.BuildEnvelope(*graph, "all")
		encoded, err := json.Marshal(envelope)
		if err != nil {
			respondError(c, http.StatusInternalServerError, "encode_failed", err.Error(), nil)
			return
		}
		payload = models.JSON(encoded)
	}
	if body.AutosaveVersion <= 0 {
		body.AutosaveVersion = 1
	}
	snapshot, err := a.Store.CreateSnapshot(c.Request.Context(), ws.ID, body.AutosaveVersion, body.Reason, payload)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "save_failed", err.Error(), nil)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"snapshot": snapshot})
}

// GetSnapshot returns one snapshot with its payload.
func (a *API) GetSnapshot(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	snapshotID, err := strconv.ParseUint(c.Param("snapshotId"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "invalid_id", "ID snapshot tidak valid.", nil)
		return
	}
	snapshot, err := a.Store.GetSnapshot(c.Request.Context(), ws.ID, uint(snapshotID))
	if errors.Is(err, store.ErrNotFound) {
		respondError(c, http.StatusNotFound, "snapshot_not_found", "Snapshot tidak ditemukan.", nil)
		return
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, "load_failed", err.Error(), nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": snapshot})
}

// DeleteSnapshot removes one recovery point.
func (a *API) DeleteSnapshot(c *gin.Context) {
	ws, ok := a.lookupWorkspace(c)
	if !ok {
		return
	}
	snapshotID, err := strconv.ParseUint(c.Param("snapshotId"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "invalid_id", "ID snapshot tidak valid.", nil)
		return
	}
	err = a.Store.DeleteSnapshot(c.Request.Context(), ws.ID, uint(snapshotID))
	if errors.Is(err, store.ErrNotFound) {
		respondError(c, http.StatusNotFound, "snapshot_not_found", "Snapshot tidak ditemukan.", nil)
		return
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, "delete_failed", err.Error(), nil)
		return
	}
	c.Status(http.StatusNoContent)
}

// lookupWorkspace resolves the :id path parameter, answering 400/404 itself.
func (a *API) lookupWorkspace(c *gin.Context) (*models.Workspace, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		respondError(c, http.StatusBadRequest, "invalid_id", "ID workspace tidak valid.", nil)
		return nil, false
	}
	ws, err := a.Store.GetWorkspace(c.Request.Context(), uint(id))
	if errors.Is(err, store.ErrNotFound) {
		respondError(c, http.StatusNotFound, "workspace_not_found", "Workspace tidak ditemukan.", nil)
		return nil, false
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, "load_failed", err.Error(), nil)
		return nil, false
	}
	return ws, true
}

func queryFloat(c *gin.Context, key string) float64 {
	value, err := strconv.ParseFloat(c.Query(key), 64)
	if err != nil {
		return 0
	}
	return value
}

// respondError writes the shared error shape.
func respondError(c *gin.Context, status int, code, message string, issues []schema.Issue) {
	body := gin.H{"code": code, "message": message}
	if len(issues) > 0 {
		body["issues"] = issues
	}
	c.JSON(status, gin.H{"error": body})
}
