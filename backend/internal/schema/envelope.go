// Package schema defines the workspace envelope that the client, the export
// endpoint and the import endpoint all speak.
//
// It is a superset of the legacy single-file app's export format, so files
// written by the old app import without conversion.
package schema

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/art/notebox/backend/internal/models"
)

// App identifier written into every exported envelope.
const App = "ruang-informasi-3d"

// FormatVersion is the envelope layout version (unchanged from the legacy app).
const FormatVersion = 1

// KnowledgeModelVersionCurrent is the knowledge-model version this server writes.
const KnowledgeModelVersionCurrent = 2

// MaxPayloadBytes mirrors the legacy 64 MiB import guard.
const MaxPayloadBytes = 64 << 20

// Envelope is the exported/imported workspace document.
type Envelope struct {
	App                   string          `json:"app"`
	Version               int             `json:"version"`
	FormatVersion         int             `json:"formatVersion"`
	KnowledgeModelVersion int             `json:"knowledgeModelVersion"`
	ExportedAt            string          `json:"exportedAt,omitempty"`
	Scope                 string          `json:"scope"`
	Nodes                 []models.Node   `json:"nodes"`
	Edges                 []models.Edge   `json:"edges"`
	Trash                 models.JSON     `json:"trash,omitempty"`
	EpistemicHistory      json.RawMessage `json:"epistemicHistory,omitempty"`
	LearningEpisodes      json.RawMessage `json:"learningEpisodes,omitempty"`
	ActionCycles          json.RawMessage `json:"actionCycles,omitempty"`
	Camera                models.JSON     `json:"camera,omitempty"`
	Tour                  models.JSON     `json:"tour,omitempty"`
	Fase2                 models.JSON     `json:"fase2,omitempty"`
}

// GraphPayload is the body of PUT /workspaces/:id/graph: the complete mutable
// state of a workspace except its identity fields.
type GraphPayload struct {
	KnowledgeModelVersion int             `json:"knowledgeModelVersion"`
	Nodes                 []models.Node   `json:"nodes"`
	Edges                 []models.Edge   `json:"edges"`
	Trash                 models.JSON     `json:"trash"`
	EpistemicHistory      json.RawMessage `json:"epistemicHistory"`
	LearningEpisodes      json.RawMessage `json:"learningEpisodes"`
	ActionCycles          json.RawMessage `json:"actionCycles"`
	Camera                models.JSON     `json:"camera"`
	Tour                  models.JSON     `json:"tour"`
	Fase2                 models.JSON     `json:"fase2"`
}

// Issue is one validation finding. Errors block a write; warnings accompany it.
type Issue struct {
	Code     string `json:"code"`
	Severity string `json:"severity"` // "error" | "warning"
	Path     string `json:"path"`
	Message  string `json:"message"`
}

// ValidationError aggregates blocking validation issues.
type ValidationError struct{ Issues []Issue }

func (e *ValidationError) Error() string {
	if len(e.Issues) == 0 {
		return "validation failed"
	}
	parts := make([]string, 0, len(e.Issues))
	for i, issue := range e.Issues {
		if i == 4 {
			parts = append(parts, fmt.Sprintf("… dan %d masalah lain", len(e.Issues)-5))
			break
		}
		parts = append(parts, fmt.Sprintf("%s: %s", issue.Path, issue.Message))
	}
	return strings.Join(parts, "; ")
}

func issue(code, severity, path, message string) Issue {
	return Issue{Code: code, Severity: severity, Path: path, Message: message}
}

// ValidateGraph checks a full graph payload before it is persisted. The rules
// mirror the legacy import pipeline: identifiers must exist and be unique and
// every edge must reference nodes that travel with it (no dangling endpoints).
func ValidateGraph(nodes []models.Node, edges []models.Edge) []Issue {
	issues := make([]Issue, 0, 4)
	nodeIDs := make(map[string]struct{}, len(nodes))
	for i, n := range nodes {
		id := n.ID.String()
		if id == "" {
			issues = append(issues, issue("node_id_required", "error", fmt.Sprintf("nodes[%d].id", i), "ID objek tidak boleh kosong."))
			continue
		}
		if _, dup := nodeIDs[id]; dup {
			issues = append(issues, issue("node_id_duplicate", "error", fmt.Sprintf("nodes[%d].id", i), fmt.Sprintf("ID objek '%s' muncul lebih dari sekali.", id)))
			continue
		}
		nodeIDs[id] = struct{}{}
	}
	edgeIDs := make(map[string]struct{}, len(edges))
	for i, e := range edges {
		path := fmt.Sprintf("edges[%d]", i)
		id := e.ID.String()
		if id == "" {
			issues = append(issues, issue("edge_id_required", "error", path+".id", "ID garis tidak boleh kosong."))
		} else if _, dup := edgeIDs[id]; dup {
			issues = append(issues, issue("edge_id_duplicate", "error", path+".id", fmt.Sprintf("ID garis '%s' muncul lebih dari sekali.", id)))
		} else {
			edgeIDs[id] = struct{}{}
		}
		if e.SourceID.String() == "" || e.TargetID.String() == "" {
			issues = append(issues, issue("edge_endpoint_required", "error", path, "Garis harus mempunyai node sumber dan tujuan."))
			continue
		}
		if _, ok := nodeIDs[e.SourceID.String()]; !ok {
			issues = append(issues, issue("edge_source_missing", "error", path+".sourceId", fmt.Sprintf("Node sumber '%s' tidak ditemukan pada payload ini.", e.SourceID)))
		}
		if _, ok := nodeIDs[e.TargetID.String()]; !ok {
			issues = append(issues, issue("edge_target_missing", "error", path+".targetId", fmt.Sprintf("Node tujuan '%s' tidak ditemukan pada payload ini.", e.TargetID)))
		}
	}
	return issues
}

// HasErrors reports whether the issue list contains a blocking error.
func HasErrors(issues []Issue) bool {
	for _, i := range issues {
		if i.Severity == "error" {
			return true
		}
	}
	return false
}

// Errors filters blocking issues.
func Errors(issues []Issue) []Issue {
	out := make([]Issue, 0, len(issues))
	for _, i := range issues {
		if i.Severity == "error" {
			out = append(out, i)
		}
	}
	return out
}

// CountJSONArray returns the number of elements in a JSON array document;
// absent (nil) and literal null both count as zero.
func CountJSONArray(raw json.RawMessage) int {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return 0
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return 0
	}
	return len(arr)
}
