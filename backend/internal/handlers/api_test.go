package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/art/notebox/backend/internal/database"
	"github.com/art/notebox/backend/internal/handlers"
	"github.com/art/notebox/backend/internal/router"
	"github.com/art/notebox/backend/internal/store"
)

// newTestServer boots the real router against a temporary SQLite file.
func newTestServer(t *testing.T) (*gin.Engine, *store.Store) {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "ri3d-test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repository := store.New(db)
	if _, err := repository.SeedWorkspace(context.Background()); err != nil {
		t.Fatalf("seed: %v", err)
	}
	engine := router.New(router.Options{API: handlers.New(repository), GinMode: gin.TestMode})
	return engine, repository
}

func doJSON(t *testing.T, engine *gin.Engine, method, path string, body any) (int, map[string]any) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}
	request := httptest.NewRequest(method, path, reader)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	var decoded map[string]any
	if recorder.Body.Len() > 0 {
		if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
			t.Fatalf("decode response %s %s: %v (body: %s)", method, path, err, recorder.Body.String())
		}
	}
	return recorder.Code, decoded
}

func nodePayload(id int, title string) map[string]any {
	return map[string]any{
		"id": id, "title": title, "desc": "<b>halo</b>", "pageTitle": "",
		"labels": []string{"uji"}, "attachments": []any{}, "kind": "claim",
		"shape": "sphere", "color": "#3b82f6", "scale": 1, "posX": 5, "posY": 0, "posZ": 0,
		"createdAt": 1700000000000,
	}
}

func TestHealth(t *testing.T) {
	engine, _ := newTestServer(t)
	status, body := doJSON(t, engine, http.MethodGet, "/api/health", nil)
	if status != http.StatusOK || body["status"] != "ok" {
		t.Fatalf("unexpected health response: %d %v", status, body)
	}
	if body["app"] != "ruang-informasi-3d" {
		t.Fatalf("unexpected app id: %v", body["app"])
	}
}

func TestSeededWorkspaceAndExport(t *testing.T) {
	engine, _ := newTestServer(t)
	status, workspace := doJSON(t, engine, http.MethodGet, "/api/workspaces/1", nil)
	if status != http.StatusOK {
		t.Fatalf("get workspace: %d %v", status, workspace)
	}
	nodes, _ := workspace["nodes"].([]any)
	if len(nodes) != 1 {
		t.Fatalf("expected one seeded node, got %d", len(nodes))
	}
	seed, _ := nodes[0].(map[string]any)
	if seed["title"] != "Pusat Arsip Informasi" {
		t.Fatalf("unexpected seed title: %v", seed["title"])
	}

	status, envelope := doJSON(t, engine, http.MethodGet, "/api/workspaces/1/export", nil)
	if status != http.StatusOK {
		t.Fatalf("export: %d %v", status, envelope)
	}
	if envelope["app"] != "ruang-informasi-3d" || envelope["scope"] != "all" {
		t.Fatalf("unexpected envelope header: %v", envelope)
	}
	for _, key := range []string{"nodes", "edges", "trash", "camera", "knowledgeModelVersion", "formatVersion"} {
		if _, ok := envelope[key]; !ok {
			t.Fatalf("export envelope missing %q", key)
		}
	}
}

func TestPutGraphRejectsDanglingEdge(t *testing.T) {
	engine, _ := newTestServer(t)
	body := map[string]any{
		"knowledgeModelVersion": 2,
		"nodes":                 []any{nodePayload(1700000000001, "Satu")},
		"edges": []any{map[string]any{
			"id": "edge_1", "sourceId": 1700000000001, "targetId": 999999, "relation": "none",
			"title": "x", "desc": "", "pageTitle": "",
		}},
		"trash": []any{}, "epistemicHistory": []any{}, "learningEpisodes": []any{}, "actionCycles": []any{},
	}
	status, response := doJSON(t, engine, http.MethodPut, "/api/workspaces/1/graph", body)
	if status != http.StatusBadRequest {
		t.Fatalf("expected rejection, got %d %v", status, response)
	}
	errorBody, _ := response["error"].(map[string]any)
	if errorBody["code"] != "validation_failed" {
		t.Fatalf("unexpected error code: %v", errorBody["code"])
	}
	issues, _ := errorBody["issues"].([]any)
	if len(issues) == 0 {
		t.Fatal("validation failure must carry issues")
	}
}

func TestGraphRoundTripAndImportMerge(t *testing.T) {
	engine, _ := newTestServer(t)
	_, workspace := doJSON(t, engine, http.MethodGet, "/api/workspaces/1", nil)
	nodes, _ := workspace["nodes"].([]any)
	seed, _ := nodes[0].(map[string]any)
	seedID := seed["id"]

	body := map[string]any{
		"knowledgeModelVersion": 2,
		"nodes":                 []any{seed, nodePayload(1700000000001, "Dua")},
		"edges": []any{map[string]any{
			"id": "edge_1700000000002", "sourceId": seedID, "targetId": 1700000000001, "relation": "→",
			"title": "Koneksi", "desc": "", "pageTitle": "", "labels": []string{}, "attachments": []any{},
			"epistemicRelation": map[string]any{"type": "supports", "status": "supported"},
		}},
		"trash": []any{}, "epistemicHistory": []any{}, "learningEpisodes": []any{}, "actionCycles": []any{},
		"camera": map[string]any{"position": []float64{0, 5, 15}, "target": []float64{0, 0, 0}},
	}
	status, put := doJSON(t, engine, http.MethodPut, "/api/workspaces/1/graph", body)
	if status != http.StatusOK {
		t.Fatalf("put graph: %d %v", status, put)
	}
	if put["nodes"] != float64(2) || put["edges"] != float64(1) {
		t.Fatalf("unexpected put counts: %v", put)
	}

	status, envelope := doJSON(t, engine, http.MethodGet, "/api/workspaces/1/export", nil)
	if status != http.StatusOK {
		t.Fatalf("export: %d", status)
	}

	status, outcome := doJSON(t, engine, http.MethodPost, "/api/workspaces/1/import?mode=merge&rule=offset&dx=20", envelope)
	if status != http.StatusOK {
		t.Fatalf("import merge: %d %v", status, outcome)
	}
	if outcome["remapped"] != true || outcome["addedNodes"] != float64(2) {
		t.Fatalf("merge must remap identifiers: %v", outcome)
	}
	if outcome["nodeCount"] != float64(4) || outcome["edgeCount"] != float64(2) {
		t.Fatalf("unexpected totals after merge: %v", outcome)
	}

	// Imported nodes must not collide with the originals.
	_, after := doJSON(t, engine, http.MethodGet, "/api/workspaces/1", nil)
	afterNodes, _ := after["nodes"].([]any)
	ids := map[any]struct{}{}
	for _, raw := range afterNodes {
		node, _ := raw.(map[string]any)
		if _, duplicate := ids[node["id"]]; duplicate {
			t.Fatalf("duplicate node id after merge: %v", node["id"])
		}
		ids[node["id"]] = struct{}{}
	}
}

func TestSnapshotsLifecycle(t *testing.T) {
	engine, _ := newTestServer(t)
	status, created := doJSON(t, engine, http.MethodPost, "/api/workspaces/1/snapshots", map[string]any{"reason": "uji"})
	if status != http.StatusCreated {
		t.Fatalf("create snapshot: %d %v", status, created)
	}
	snapshot, _ := created["snapshot"].(map[string]any)
	id, ok := snapshot["id"].(float64)
	if !ok {
		t.Fatalf("snapshot response missing id: %v", created)
	}

	status, list := doJSON(t, engine, http.MethodGet, "/api/workspaces/1/snapshots", nil)
	if status != http.StatusOK {
		t.Fatalf("list snapshots: %d", status)
	}
	snapshots, _ := list["snapshots"].([]any)
	if len(snapshots) != 1 {
		t.Fatalf("expected one snapshot, got %d", len(snapshots))
	}

	status, fetched := doJSON(t, engine, http.MethodGet, "/api/workspaces/1/snapshots/"+strconv.Itoa(int(id)), nil)
	if status != http.StatusOK {
		t.Fatalf("get snapshot: %d", status)
	}
	withPayload, _ := fetched["snapshot"].(map[string]any)
	payload, _ := withPayload["payload"].(map[string]any)
	if payload == nil || payload["app"] != "ruang-informasi-3d" {
		t.Fatalf("snapshot payload must be a full envelope: %v", withPayload)
	}

	status, _ = doJSON(t, engine, http.MethodDelete, "/api/workspaces/1/snapshots/"+strconv.Itoa(int(id)), nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete snapshot: %d", status)
	}
	status, _ = doJSON(t, engine, http.MethodGet, "/api/workspaces/1/snapshots/"+strconv.Itoa(int(id)), nil)
	if status != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", status)
	}
}

func TestUnknownWorkspaceIs404(t *testing.T) {
	engine, _ := newTestServer(t)
	status, body := doJSON(t, engine, http.MethodGet, "/api/workspaces/999", nil)
	if status != http.StatusNotFound {
		t.Fatalf("expected 404, got %d %v", status, body)
	}
}
