package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/art/notebox/backend/internal/models"
	"github.com/art/notebox/backend/internal/schema"
)

func node(id string, x, y, z float64) models.Node {
	return models.Node{ID: models.ID(id), Title: "N" + id, Shape: "cube", PosX: x, PosY: y, PosZ: z}
}

func edge(id, source, target string) models.Edge {
	return models.Edge{ID: models.ID(id), SourceID: models.ID(source), TargetID: models.ID(target), Relation: "none", Title: "E" + id}
}

func TestValidateGraphRejectsDanglingEdges(t *testing.T) {
	nodes := []models.Node{node("1", 0, 0, 0)}
	edges := []models.Edge{edge("edge_1", "1", "2")}
	issues := schema.ValidateGraph(nodes, edges)
	if !schema.HasErrors(issues) {
		t.Fatalf("expected dangling edge to be rejected, got %#v", issues)
	}
	if issues[0].Path != "edges[0].targetId" {
		t.Fatalf("unexpected issue path: %s", issues[0].Path)
	}
}

func TestValidateGraphAcceptsWellFormedGraph(t *testing.T) {
	nodes := []models.Node{node("1", 0, 0, 0), node("2", 1, 0, 0)}
	edges := []models.Edge{edge("edge_1", "1", "2")}
	if issues := schema.ValidateGraph(nodes, edges); schema.HasErrors(issues) {
		t.Fatalf("expected valid graph, got %#v", issues)
	}
}

func TestPlanImportMergeRemapsIdentifiers(t *testing.T) {
	current := WorkspaceGraph{KnowledgeModelVersion: 2, Nodes: []models.Node{node("100", 0, 0, 0)}}
	env := schema.Envelope{
		App: schema.App, Scope: "all",
		Nodes: []models.Node{node("100", 5, 0, 0), node("101", 6, 0, 0)},
		Edges: []models.Edge{edge("edge_100", "100", "101")},
	}
	plan, err := PlanImport(current, env, ImportOptions{Mode: ImportMerge, Rule: PlaceOffset, DX: 1, NowMs: 1_700_000_000_000})
	if err != nil {
		t.Fatalf("PlanImport: %v", err)
	}
	if !plan.Remapped {
		t.Fatal("merge import must remap identifiers to avoid collisions")
	}
	if len(plan.Nodes) != 3 || len(plan.Edges) != 1 {
		t.Fatalf("unexpected sizes: %d nodes, %d edges", len(plan.Nodes), len(plan.Edges))
	}
	// Existing node is untouched; imported node keeps its payload but new id.
	if plan.Nodes[0].ID.String() != "100" {
		t.Fatalf("existing node id changed: %s", plan.Nodes[0].ID)
	}
	imported := plan.Nodes[1]
	if imported.ID.String() == "100" {
		t.Fatal("imported node reused a live identifier")
	}
	if imported.PosX != 6 { // 5 + dx 1
		t.Fatalf("offset placement not applied: %v", imported.PosX)
	}
	// Edge endpoints must point at the remapped node ids.
	importedNodeIDs := map[string]bool{plan.Nodes[1].ID.String(): true, plan.Nodes[2].ID.String(): true}
	if !importedNodeIDs[plan.Edges[0].SourceID.String()] || !importedNodeIDs[plan.Edges[0].TargetID.String()] {
		t.Fatalf("edge endpoints not remapped: %s -> %s", plan.Edges[0].SourceID, plan.Edges[0].TargetID)
	}
}

func TestPlanImportMergeRefusesKnowledgeRecords(t *testing.T) {
	current := WorkspaceGraph{KnowledgeModelVersion: 2}
	env := schema.Envelope{
		App: schema.App, Scope: "all",
		Nodes:            []models.Node{node("1", 0, 0, 0)},
		EpistemicHistory: json.RawMessage(`[{"id":"x"}]`),
	}
	_, err := PlanImport(current, env, ImportOptions{Mode: ImportMerge, Rule: PlaceOriginal})
	if err == nil || !strings.Contains(err.Error(), "catatan pengetahuan") {
		t.Fatalf("expected knowledge-record rejection, got %v", err)
	}
}

func TestPlanImportReplaceSelectionRefusedOnKnowledgeWorkspace(t *testing.T) {
	current := WorkspaceGraph{KnowledgeModelVersion: 2, EpistemicHistory: json.RawMessage(`[{"id":"x"}]`)}
	env := schema.Envelope{App: schema.App, Scope: "selection", Nodes: []models.Node{node("1", 0, 0, 0)}}
	_, err := PlanImport(current, env, ImportOptions{Mode: ImportReplace, Rule: PlaceOriginal})
	if err == nil || !strings.Contains(err.Error(), "catatan pengetahuan") {
		t.Fatalf("expected selection-replace rejection, got %v", err)
	}
}

func TestPlanImportMarksLegacyKnowledgeModel(t *testing.T) {
	env := schema.Envelope{App: schema.App, Scope: "all", KnowledgeModelVersion: 1, Nodes: []models.Node{node("1", 0, 0, 0)}}
	plan, err := PlanImport(WorkspaceGraph{}, env, ImportOptions{Mode: ImportReplace, Rule: PlaceOriginal})
	if err != nil {
		t.Fatalf("PlanImport: %v", err)
	}
	if plan.MigratedFrom != 1 {
		t.Fatalf("expected migration notice for V1 payload, got %d", plan.MigratedFrom)
	}
}

func TestPlanImportGridPlacement(t *testing.T) {
	nodes := make([]models.Node, 0, 5)
	for i := range 5 {
		nodes = append(nodes, node(string(rune('a'+i)), float64(i), 9, float64(i)))
	}
	env := schema.Envelope{App: schema.App, Scope: "all", Nodes: nodes}
	plan, err := PlanImport(WorkspaceGraph{}, env, ImportOptions{Mode: ImportReplace, Rule: PlaceGrid})
	if err != nil {
		t.Fatalf("PlanImport: %v", err)
	}
	// Grid columns for 5 nodes = 3, spacing 10, y = 2.
	want := []struct{ x, z float64 }{{0, 0}, {10, 0}, {20, 0}, {0, 10}, {10, 10}}
	for i, expected := range want {
		if plan.Nodes[i].PosX != expected.x || plan.Nodes[i].PosZ != expected.z || plan.Nodes[i].PosY != 2 {
			t.Fatalf("node %d at (%v,%v,%v), want (%v,2,%v)",
				i, plan.Nodes[i].PosX, plan.Nodes[i].PosY, plan.Nodes[i].PosZ, expected.x, expected.z)
		}
	}
}

func TestPlanImportRemapsEpistemicSourceRefs(t *testing.T) {
	rel := models.JSON(`{"type":"supports","status":"supported","sourceRefs":[{"type":"node","id":"1"}]}`)
	env := schema.Envelope{
		App: schema.App, Scope: "all",
		Nodes: []models.Node{node("1", 0, 0, 0), node("2", 1, 0, 0)},
		Edges: []models.Edge{{ID: "edge_1", SourceID: "1", TargetID: "2", Relation: "→", EpistemicRelation: rel}},
	}
	plan, err := PlanImport(WorkspaceGraph{}, env, ImportOptions{Mode: ImportMerge, Rule: PlaceOriginal, NowMs: 1_700_000_000_000})
	if err != nil {
		t.Fatalf("PlanImport: %v", err)
	}
	var decoded struct {
		SourceRefs []struct {
			ID         string `json:"id"`
			Unresolved bool   `json:"unresolved"`
		} `json:"sourceRefs"`
	}
	if err := json.Unmarshal(plan.Edges[0].EpistemicRelation, &decoded); err != nil {
		t.Fatalf("decode relation: %v", err)
	}
	if decoded.SourceRefs[0].ID == "1" {
		t.Fatal("sourceRef id was not remapped")
	}
	if decoded.SourceRefs[0].Unresolved {
		t.Fatal("reference inside the payload must stay resolved")
	}
}

func TestPlanImportMarksOutsideReferencesUnresolved(t *testing.T) {
	rel := models.JSON(`{"type":"supports","sourceRefs":[{"type":"node","id":"999"}]}`)
	env := schema.Envelope{
		App: schema.App, Scope: "selection",
		Nodes: []models.Node{node("1", 0, 0, 0), node("2", 1, 0, 0)},
		Edges: []models.Edge{{ID: "edge_1", SourceID: "1", TargetID: "2", Relation: "→", EpistemicRelation: rel}},
	}
	plan, err := PlanImport(WorkspaceGraph{}, env, ImportOptions{Mode: ImportReplace, Rule: PlaceOriginal})
	if err != nil {
		t.Fatalf("PlanImport: %v", err)
	}
	var decoded struct {
		SourceRefs []struct {
			Unresolved    bool   `json:"unresolved"`
			TitleSnapshot string `json:"titleSnapshot"`
		} `json:"sourceRefs"`
	}
	if err := json.Unmarshal(plan.Edges[0].EpistemicRelation, &decoded); err != nil {
		t.Fatalf("decode relation: %v", err)
	}
	if !decoded.SourceRefs[0].Unresolved || decoded.SourceRefs[0].TitleSnapshot == "" {
		t.Fatalf("outside reference must be marked unresolved with a snapshot: %#v", decoded.SourceRefs[0])
	}
}

func TestBuildEnvelopeKeepsEmptyArrays(t *testing.T) {
	env := BuildEnvelope(WorkspaceGraph{KnowledgeModelVersion: 2}, "all")
	if env.Nodes == nil || env.Edges == nil {
		t.Fatal("export must contain empty node/edge arrays, not null")
	}
	if env.App != schema.App || env.FormatVersion != schema.FormatVersion {
		t.Fatalf("unexpected envelope header: %+v", env)
	}
}
