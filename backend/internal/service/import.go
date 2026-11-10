// Package service holds the workspace use-cases: assembling envelopes from the
// database and planning imports.
package service

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/art/notebox/backend/internal/models"
	"github.com/art/notebox/backend/internal/schema"
)

// WorkspaceGraph is the complete mutable state of one workspace.
type WorkspaceGraph struct {
	KnowledgeModelVersion int
	Nodes                 []models.Node
	Edges                 []models.Edge
	Trash                 models.JSON
	EpistemicHistory      json.RawMessage
	LearningEpisodes      json.RawMessage
	ActionCycles          json.RawMessage
	Camera                models.JSON
	Tour                  models.JSON
	Fase2                 models.JSON
}

// BuildEnvelope renders the exported document for a workspace.
func BuildEnvelope(graph WorkspaceGraph, scope string) schema.Envelope {
	env := schema.Envelope{
		App:                   schema.App,
		Version:               1,
		FormatVersion:         schema.FormatVersion,
		KnowledgeModelVersion: graph.KnowledgeModelVersion,
		ExportedAt:            time.Now().UTC().Format(time.RFC3339),
		Scope:                 scope,
		Nodes:                 nonNilNodes(graph.Nodes),
		Edges:                 nonNilEdges(graph.Edges),
	}
	// The legacy app always wrote these collections into a full export, even when
	// empty. Keeping them present keeps round-trips and diffs predictable.
	env.Trash = graph.Trash
	if env.Trash.IsNull() {
		env.Trash = models.JSON("[]")
	}
	env.EpistemicHistory = emptyArrayIfAbsent(graph.EpistemicHistory)
	env.LearningEpisodes = emptyArrayIfAbsent(graph.LearningEpisodes)
	env.ActionCycles = emptyArrayIfAbsent(graph.ActionCycles)
	if !graph.Camera.IsNull() {
		env.Camera = graph.Camera
	} else {
		// A full export always carries a camera; a never-moved workspace keeps
		// the home view.
		env.Camera = models.JSON(`{"position":[0,5,15],"target":[0,0,0]}`)
	}
	if !graph.Tour.IsNull() {
		env.Tour = graph.Tour
	}
	if !graph.Fase2.IsNull() {
		env.Fase2 = graph.Fase2
	}
	return env
}

// emptyArrayIfAbsent normalizes absent/null collections to an empty JSON array.
func emptyArrayIfAbsent(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || isJSONNull(raw) {
		return json.RawMessage("[]")
	}
	return raw
}

func nonNilNodes(nodes []models.Node) []models.Node {
	if nodes == nil {
		return []models.Node{}
	}
	return nodes
}

func nonNilEdges(edges []models.Edge) []models.Edge {
	if edges == nil {
		return []models.Edge{}
	}
	return edges
}

func isJSONNull(raw []byte) bool {
	return string(raw) == "null"
}

// ImportMode selects how an incoming envelope combines with existing state.
type ImportMode string

const (
	// ImportMerge adds the payload to the workspace under fresh identifiers.
	ImportMerge ImportMode = "merge"
	// ImportReplace swaps the workspace content for the payload.
	ImportReplace ImportMode = "replace"
)

// PlacementRule selects how incoming objects are positioned in the space.
type PlacementRule string

const (
	// PlaceOriginal keeps the coordinates stored in the payload.
	PlaceOriginal PlacementRule = "original"
	// PlaceOffset shifts every object by (DX, DY, DZ).
	PlaceOffset PlacementRule = "offset"
	// PlaceOrigin centers objects on the X/Z origin.
	PlaceOrigin PlacementRule = "origin"
	// PlaceCamera drops objects in front of the stored camera.
	PlaceCamera PlacementRule = "camera"
	// PlaceGrid lays objects out on a square grid.
	PlaceGrid PlacementRule = "grid"
)

// ImportOptions controls a single import operation.
type ImportOptions struct {
	Mode  ImportMode
	Rule  PlacementRule
	DX    float64
	DY    float64
	DZ    float64
	Avoid bool
	NowMs int64 // injectable clock for deterministic tests
}

// ImportPlan is the outcome of planning an import: the resulting sets are ready
// to be written in one transaction.
type ImportPlan struct {
	Nodes        []models.Node
	Edges        []models.Edge
	Trash        models.JSON
	Epistemic    json.RawMessage
	Episodes     json.RawMessage
	Actions      json.RawMessage
	Camera       models.JSON
	Tour         models.JSON
	Fase2        models.JSON
	Remapped     bool
	AddedNodes   int
	AddedEdges   int
	MigratedFrom int
	Warnings     []string
}

// PlanImport validates an envelope and produces the state an import would write.
// It never mutates its inputs.
func PlanImport(current WorkspaceGraph, env schema.Envelope, opts ImportOptions) (*ImportPlan, error) {
	if len(env.Nodes) > 20000 || len(env.Edges) > 20000 {
		return nil, fmt.Errorf("payload terlalu besar: %d objek, %d garis (batas 20000 per jenis)", len(env.Nodes), len(env.Edges))
	}
	if issues := schema.ValidateGraph(env.Nodes, env.Edges); schema.HasErrors(issues) {
		return nil, &schema.ValidationError{Issues: schema.Errors(issues)}
	}

	hasKnowledge := schema.CountJSONArray(env.EpistemicHistory)+schema.CountJSONArray(env.LearningEpisodes)+schema.CountJSONArray(env.ActionCycles) > 0
	currentHasKnowledge := schema.CountJSONArray(current.EpistemicHistory)+schema.CountJSONArray(current.LearningEpisodes)+schema.CountJSONArray(current.ActionCycles) > 0
	switch opts.Mode {
	case ImportMerge:
		if hasKnowledge {
			return nil, fmt.Errorf("mode gabung menolak payload yang berisi catatan pengetahuan (riwayat epistemik, episode belajar, atau siklus tindakan); gunakan mode ganti")
		}
	case ImportReplace:
		if env.Scope == "selection" && currentHasKnowledge {
			return nil, fmt.Errorf("ekspor pilihan tidak boleh menggantikan workspace yang memiliki catatan pengetahuan; gunakan mode gabung atau ekspor penuh")
		}
	default:
		return nil, fmt.Errorf("mode impor tidak dikenal: %q (gunakan merge atau replace)", opts.Mode)
	}

	plan := &ImportPlan{Warnings: []string{}}
	if env.KnowledgeModelVersion > 0 && env.KnowledgeModelVersion < schema.KnowledgeModelVersionCurrent {
		plan.MigratedFrom = env.KnowledgeModelVersion
	}

	now := opts.NowMs
	if now == 0 {
		now = time.Now().UnixMilli()
	}

	nodeMap := make(map[string]models.ID, len(env.Nodes))
	edgeMap := make(map[string]models.ID, len(env.Edges))
	reserved := reservedIDs(current)

	nextSeq := now
	freshID := func(kind string) models.ID {
		for {
			nextSeq++
			candidate := fmt.Sprintf("%d", nextSeq)
			if kind == "edge" {
				candidate = "edge_" + candidate
			}
			if _, taken := reserved[candidate]; !taken {
				reserved[candidate] = struct{}{}
				return models.ID(candidate)
			}
		}
	}

	nodes := make([]models.Node, len(env.Nodes))
	copy(nodes, env.Nodes)
	for i := range nodes {
		if opts.Mode == ImportMerge {
			newID := freshID("node")
			nodeMap[nodes[i].ID.String()] = newID
			nodes[i].ID = newID
			plan.Remapped = true
		} else {
			nodeMap[nodes[i].ID.String()] = nodes[i].ID
		}
	}

	edges := make([]models.Edge, len(env.Edges))
	copy(edges, env.Edges)
	for i := range edges {
		if opts.Mode == ImportMerge {
			newID := freshID("edge")
			edgeMap[edges[i].ID.String()] = newID
			edges[i].ID = newID
			plan.Remapped = true
		} else {
			edgeMap[edges[i].ID.String()] = edges[i].ID
		}
		edges[i].SourceID = remapID(edges[i].SourceID, nodeMap, nodeMap)
		edges[i].TargetID = remapID(edges[i].TargetID, nodeMap, nodeMap)
		edges[i].EpistemicRelation = remapRelationRefs(edges[i].EpistemicRelation, nodeMap, edgeMap, env, plan)
	}

	titleByID := make(map[string]string, len(nodes)+len(edges))
	presentNodes := make(map[string]struct{}, len(nodes))
	for _, n := range nodes {
		titleByID[n.ID.String()] = n.Title
		presentNodes[n.ID.String()] = struct{}{}
	}
	presentEdges := make(map[string]struct{}, len(edges))
	for _, e := range edges {
		titleByID[e.ID.String()] = e.Title
		presentEdges[e.ID.String()] = struct{}{}
	}
	edges = markUnresolvedRefs(edges, presentNodes, presentEdges, titleByID)

	if opts.Mode == ImportMerge {
		plan.Nodes = append(append([]models.Node{}, current.Nodes...), nodes...)
		plan.Edges = append(append([]models.Edge{}, current.Edges...), edges...)
		plan.Trash = mergeTrash(current.Trash, env.Trash, nodeMap, edgeMap, plan)
		plan.Epistemic = firstNonEmpty(current.EpistemicHistory, nil)
		plan.Episodes = firstNonEmpty(current.LearningEpisodes, nil)
		plan.Actions = firstNonEmpty(current.ActionCycles, nil)
		plan.Camera = firstJSON(current.Camera, nil)
		plan.Tour = firstJSON(current.Tour, nil)
		plan.Fase2 = firstJSON(current.Fase2, nil)
	} else {
		plan.Nodes = nodes
		plan.Edges = edges
		plan.Trash = env.Trash
		plan.Epistemic = env.EpistemicHistory
		plan.Episodes = env.LearningEpisodes
		plan.Actions = env.ActionCycles
		if opts.Rule == PlaceOriginal {
			plan.Camera = env.Camera
		} else {
			plan.Camera = current.Camera
		}
		plan.Tour = env.Tour
		plan.Fase2 = env.Fase2
	}

	applyPlacement(plan.Nodes, opts, plan.Camera)
	if opts.Avoid {
		avoidOverlap(plan.Nodes)
	}

	plan.AddedNodes = len(nodes)
	plan.AddedEdges = len(edges)
	return plan, nil
}

// applyPlacement moves the imported nodes according to the chosen rule.
func applyPlacement(nodes []models.Node, opts ImportOptions, camera models.JSON) {
	if len(nodes) == 0 {
		return
	}
	switch opts.Rule {
	case PlaceOffset:
		for i := range nodes {
			nodes[i].PosX += opts.DX
			nodes[i].PosY += opts.DY
			nodes[i].PosZ += opts.DZ
		}
	case PlaceOrigin:
		var cx, cz float64
		for _, n := range nodes {
			cx += n.PosX
			cz += n.PosZ
		}
		cx /= float64(len(nodes))
		cz /= float64(len(nodes))
		for i := range nodes {
			nodes[i].PosX -= cx
			nodes[i].PosZ -= cz
		}
	case PlaceGrid:
		cols := int(math.Ceil(math.Sqrt(float64(len(nodes)))))
		if cols < 1 {
			cols = 1
		}
		const spacing = 10.0
		for i := range nodes {
			nodes[i].PosX = float64(i%cols) * spacing
			nodes[i].PosY = 2
			nodes[i].PosZ = float64(i/cols) * spacing
		}
	case PlaceCamera:
		// Drop the payload centred on the saved camera target and pushed
		// 12 units along the view direction, so objects land in front of the eye.
		targetX, targetY, targetZ := 0.0, 0.0, 0.0
		dirX, dirY, dirZ := 0.0, 0.0, 1.0
		var cam struct {
			Position []float64 `json:"position"`
			Target   []float64 `json:"target"`
		}
		if !camera.IsNull() && json.Unmarshal(camera, &cam) == nil {
			if len(cam.Target) == 3 {
				targetX, targetY, targetZ = cam.Target[0], cam.Target[1], cam.Target[2]
			}
			if len(cam.Position) == 3 {
				dirX, dirY, dirZ = targetX-cam.Position[0], targetY-cam.Position[1], targetZ-cam.Position[2]
				if l := math.Sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ); l > 0 {
					dirX, dirY, dirZ = dirX/l, dirY/l, dirZ/l
				}
			}
		}
		var cx, cy, cz float64
		for _, n := range nodes {
			cx += n.PosX
			cy += n.PosY
			cz += n.PosZ
		}
		cx /= float64(len(nodes))
		cy /= float64(len(nodes))
		cz /= float64(len(nodes))
		baseX := targetX + dirX*12
		baseY := targetY + dirY*12
		baseZ := targetZ + dirZ*12
		for i := range nodes {
			nodes[i].PosX = baseX + (nodes[i].PosX - cx)
			nodes[i].PosY = baseY + (nodes[i].PosY - cy)
			nodes[i].PosZ = baseZ + (nodes[i].PosZ - cz)
		}
	case PlaceOriginal, "":
		// Keep stored coordinates.
	}
}

// avoidOverlap nudges nodes that share a rounded position, mirroring the legacy
// collision avoidance: move +4 on X, and every eighth step also -32 X / +4 Z.
func avoidOverlap(nodes []models.Node) {
	const cell = 1.0
	occupied := make(map[[3]int64]int, len(nodes))
	for i := range nodes {
		key := [3]int64{
			int64(math.Round(nodes[i].PosX / cell)),
			int64(math.Round(nodes[i].PosY / cell)),
			int64(math.Round(nodes[i].PosZ / cell)),
		}
		if _, clash := occupied[key]; !clash {
			occupied[key] = i
			continue
		}
		for step := range 80 {
			nodes[i].PosX += 4
			if step%8 == 7 {
				nodes[i].PosX -= 32
				nodes[i].PosZ += 4
			}
			key = [3]int64{
				int64(math.Round(nodes[i].PosX / cell)),
				int64(math.Round(nodes[i].PosY / cell)),
				int64(math.Round(nodes[i].PosZ / cell)),
			}
			if _, clash := occupied[key]; !clash {
				break
			}
		}
		occupied[key] = i
	}
}

// remapID resolves an id through the primary map, falling back to the secondary
// map or the original value.
func remapID(id models.ID, primary, secondary map[string]models.ID) models.ID {
	if mapped, ok := primary[id.String()]; ok {
		return mapped
	}
	if mapped, ok := secondary[id.String()]; ok {
		return mapped
	}
	return id
}

// remapRelationRefs rewrites epistemic sourceRefs to the remapped ids.
func remapRelationRefs(raw models.JSON, nodeMap, edgeMap map[string]models.ID, env schema.Envelope, plan *ImportPlan) models.JSON {
	if raw.IsNull() {
		return raw
	}
	var rel map[string]any
	if err := json.Unmarshal(raw, &rel); err != nil {
		return raw
	}
	refs, ok := rel["sourceRefs"].([]any)
	if !ok {
		return raw
	}
	for _, entry := range refs {
		ref, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		kind, _ := ref["type"].(string)
		idValue, ok := ref["id"].(string)
		if !ok || idValue == "" {
			continue
		}
		mapping := nodeMap
		if kind == "edge" {
			mapping = edgeMap
		}
		if mapped, found := mapping[idValue]; found {
			ref["id"] = mapped.String()
		}
	}
	updated, err := json.Marshal(rel)
	if err != nil {
		return raw
	}
	return models.JSON(updated)
}

// markUnresolvedRefs keeps references to objects that stayed behind usable by
// stamping them unresolved with a title snapshot, the same convention the legacy
// export pipeline used. The sets describe the objects that travel with the
// payload after identifier remapping.
func markUnresolvedRefs(edges []models.Edge, presentNodes, presentEdges map[string]struct{}, titleByID map[string]string) []models.Edge {
	present := map[string]map[string]struct{}{"node": presentNodes, "edge": presentEdges}
	for i := range edges {
		if edges[i].EpistemicRelation.IsNull() {
			continue
		}
		var rel map[string]any
		if err := json.Unmarshal(edges[i].EpistemicRelation, &rel); err != nil {
			continue
		}
		refs, ok := rel["sourceRefs"].([]any)
		if !ok {
			continue
		}
		for _, entry := range refs {
			ref, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			kind, _ := ref["type"].(string)
			idValue, _ := ref["id"].(string)
			if _, ok := present[kind][idValue]; ok {
				delete(ref, "unresolved")
				delete(ref, "titleSnapshot")
				continue
			}
			ref["unresolved"] = true
			if snapshot, ok := ref["titleSnapshot"].(string); !ok || snapshot == "" {
				title, found := titleByID[idValue]
				if !found || title == "" {
					title = fmt.Sprintf("ID %s (objek tidak disertakan)", idValue)
				}
				ref["titleSnapshot"] = title
			}
		}
		if updated, err := json.Marshal(rel); err == nil {
			edges[i].EpistemicRelation = models.JSON(updated)
		}
	}
	return edges
}

// mergeTrash appends imported trash entries, remapping their identifiers.
func mergeTrash(current, incoming models.JSON, nodeMap, edgeMap map[string]models.ID, plan *ImportPlan) models.JSON {
	if incoming.IsNull() {
		return current
	}
	var currentItems []map[string]any
	if !current.IsNull() {
		_ = json.Unmarshal(current, &currentItems)
	}
	var incomingItems []map[string]any
	if err := json.Unmarshal(incoming, &incomingItems); err != nil {
		plan.Warnings = append(plan.Warnings, "Tempat sampah pada payload tidak dapat dibaca dan dilewati.")
		return current
	}
	remapped := 0
	for _, item := range incomingItems {
		if data, ok := item["data"].(map[string]any); ok {
			if id, ok := data["id"].(string); ok {
				kind, _ := item["objType"].(string)
				mapping := nodeMap
				if kind == "edge" {
					mapping = edgeMap
				}
				if mapped, found := mapping[id]; found {
					data["id"] = mapped.String()
					remapped++
				}
			}
			for _, field := range []string{"sourceId", "targetId"} {
				if value, ok := data[field].(string); ok {
					if mapped, found := nodeMap[value]; found {
						data[field] = mapped.String()
					}
				}
			}
		}
		currentItems = append(currentItems, item)
	}
	if remapped > 0 {
		plan.Warnings = append(plan.Warnings, fmt.Sprintf("%d catatan tempat sampah memakai ID baru agar tidak bertabrakan.", remapped))
	}
	out, err := json.Marshal(currentItems)
	if err != nil {
		return current
	}
	return models.JSON(out)
}

// reservedIDs collects every identifier that must not be handed out again:
// live objects, archived objects and archived edge endpoints.
func reservedIDs(current WorkspaceGraph) map[string]struct{} {
	reserved := make(map[string]struct{}, len(current.Nodes)+len(current.Edges))
	for _, n := range current.Nodes {
		reserved[n.ID.String()] = struct{}{}
	}
	for _, e := range current.Edges {
		reserved[e.ID.String()] = struct{}{}
	}
	if !current.Trash.IsNull() {
		var items []struct {
			ObjType string          `json:"objType"`
			Data    json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(current.Trash, &items); err == nil {
			for _, item := range items {
				var data map[string]any
				if err := json.Unmarshal(item.Data, &data); err != nil {
					continue
				}
				if id, ok := data["id"].(string); ok && id != "" {
					reserved[id] = struct{}{}
				}
				for _, field := range []string{"sourceId", "targetId"} {
					if value, ok := data[field].(string); ok && value != "" {
						reserved[value] = struct{}{}
					}
				}
			}
		}
	}
	return reserved
}

func firstNonEmpty(primary, fallback json.RawMessage) json.RawMessage {
	if len(primary) > 0 && !isJSONNull(primary) {
		return primary
	}
	return fallback
}

func firstJSON(primary, fallback models.JSON) models.JSON {
	if !primary.IsNull() {
		return primary
	}
	return fallback
}

// SortedNodeIDs returns node ids in ascending numeric order if numeric,
// lexicographic otherwise. Used by tests and diagnostics.
func SortedNodeIDs(nodes []models.Node) []string {
	ids := make([]string, 0, len(nodes))
	for _, n := range nodes {
		ids = append(ids, n.ID.String())
	}
	sort.Strings(ids)
	return ids
}
