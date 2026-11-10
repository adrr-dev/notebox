// Package store contains the database access layer. Handlers never talk to
// GORM directly; every query lives here so the persistence rules stay in one
// place.
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/art/notebox/backend/internal/models"
	"github.com/art/notebox/backend/internal/service"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// SnapshotRetention is how many autosave snapshots are kept per workspace.
const SnapshotRetention = 30

// Store wraps the database handle.
type Store struct{ db *gorm.DB }

// New creates a store.
func New(db *gorm.DB) *Store { return &Store{db: db} }

// DB exposes the handle for migrations and seeding.
func (s *Store) DB() *gorm.DB { return s.db }

// ListWorkspaces returns the workspace list with node/edge counts.
func (s *Store) ListWorkspaces(ctx context.Context) ([]models.WorkspaceSummary, error) {
	var workspaces []models.Workspace
	if err := s.db.WithContext(ctx).Order("id").Find(&workspaces).Error; err != nil {
		return nil, err
	}
	summaries := make([]models.WorkspaceSummary, 0, len(workspaces))
	for _, ws := range workspaces {
		summary := models.WorkspaceSummary{ID: ws.ID, Name: ws.Name, UpdatedAt: ws.UpdatedAt}
		if err := s.db.WithContext(ctx).Model(&models.Node{}).Where("workspace_id = ?", ws.ID).Count(&summary.NodeCount).Error; err != nil {
			return nil, err
		}
		if err := s.db.WithContext(ctx).Model(&models.Edge{}).Where("workspace_id = ?", ws.ID).Count(&summary.EdgeCount).Error; err != nil {
			return nil, err
		}
		summaries = append(summaries, summary)
	}
	return summaries, nil
}

// CreateWorkspace inserts an empty workspace.
func (s *Store) CreateWorkspace(ctx context.Context, name string) (*models.Workspace, error) {
	ws := &models.Workspace{
		Name:                  name,
		FormatVersion:         1,
		KnowledgeModelVersion: 2,
	}
	if err := s.db.WithContext(ctx).Create(ws).Error; err != nil {
		return nil, err
	}
	return ws, nil
}

// GetWorkspace loads one workspace row.
func (s *Store) GetWorkspace(ctx context.Context, id uint) (*models.Workspace, error) {
	var ws models.Workspace
	err := s.db.WithContext(ctx).First(&ws, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &ws, nil
}

// LoadGraph assembles the full mutable state of a workspace.
func (s *Store) LoadGraph(ctx context.Context, ws *models.Workspace) (*service.WorkspaceGraph, error) {
	graph := &service.WorkspaceGraph{
		KnowledgeModelVersion: ws.KnowledgeModelVersion,
		Trash:                 ws.Trash,
		EpistemicHistory:      rawOf(ws.EpistemicHistory),
		LearningEpisodes:      rawOf(ws.LearningEpisodes),
		ActionCycles:          rawOf(ws.ActionCycles),
		Camera:                ws.Camera,
		Tour:                  ws.Tour,
		Fase2:                 ws.Fase2,
	}
	if err := s.db.WithContext(ctx).Where("workspace_id = ?", ws.ID).Order("id").Find(&graph.Nodes).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Where("workspace_id = ?", ws.ID).Order("id").Find(&graph.Edges).Error; err != nil {
		return nil, err
	}
	return graph, nil
}

// SaveGraph atomically replaces the graph of a workspace. Nodes and edges are
// rewritten as a unit because the client saves the whole workspace document.
func (s *Store) SaveGraph(ctx context.Context, ws *models.Workspace, graph service.WorkspaceGraph) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("workspace_id = ?", ws.ID).Delete(&models.Node{}).Error; err != nil {
			return err
		}
		if err := tx.Where("workspace_id = ?", ws.ID).Delete(&models.Edge{}).Error; err != nil {
			return err
		}
		for i := range graph.Nodes {
			graph.Nodes[i].WorkspaceID = ws.ID
		}
		for i := range graph.Edges {
			graph.Edges[i].WorkspaceID = ws.ID
		}
		if len(graph.Nodes) > 0 {
			if err := tx.CreateInBatches(graph.Nodes, 200).Error; err != nil {
				return err
			}
		}
		if len(graph.Edges) > 0 {
			if err := tx.CreateInBatches(graph.Edges, 200).Error; err != nil {
				return err
			}
		}
		updates := map[string]any{
			"knowledge_model_version": graph.KnowledgeModelVersion,
			"trash":                   nullableJSON(graph.Trash),
			"epistemic_history":       nullableRaw(graph.EpistemicHistory),
			"learning_episodes":       nullableRaw(graph.LearningEpisodes),
			"action_cycles":           nullableRaw(graph.ActionCycles),
			"camera":                  nullableJSON(graph.Camera),
			"tour":                    nullableJSON(graph.Tour),
			"fase2":                   nullableJSON(graph.Fase2),
		}
		return tx.Model(&models.Workspace{}).Where("id = ?", ws.ID).Updates(updates).Error
	})
}

// CreateSnapshot stores a recovery point and prunes old ones.
func (s *Store) CreateSnapshot(ctx context.Context, workspaceID uint, autosaveVersion int, reason string, payload models.JSON) (*models.Snapshot, error) {
	snapshot := &models.Snapshot{
		WorkspaceID:     workspaceID,
		AutosaveVersion: autosaveVersion,
		Reason:          reason,
		Bytes:           int64(len(payload)),
		Payload:         payload,
	}
	if err := s.db.WithContext(ctx).Create(snapshot).Error; err != nil {
		return nil, err
	}
	if err := s.pruneSnapshots(ctx, workspaceID); err != nil {
		return nil, err
	}
	return snapshot, nil
}

func (s *Store) pruneSnapshots(ctx context.Context, workspaceID uint) error {
	var ids []uint
	if err := s.db.WithContext(ctx).Model(&models.Snapshot{}).
		Where("workspace_id = ?", workspaceID).
		Order("id DESC").
		Offset(SnapshotRetention).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Where("id IN ?", ids).Delete(&models.Snapshot{}).Error
}

// ListSnapshots returns snapshots newest first, without payloads.
func (s *Store) ListSnapshots(ctx context.Context, workspaceID uint, limit int) ([]models.Snapshot, error) {
	if limit <= 0 || limit > SnapshotRetention {
		limit = SnapshotRetention
	}
	var snapshots []models.Snapshot
	err := s.db.WithContext(ctx).
		Select("id", "workspace_id", "autosave_version", "reason", "bytes", "saved_at").
		Where("workspace_id = ?", workspaceID).
		Order("id DESC").
		Limit(limit).
		Find(&snapshots).Error
	return snapshots, err
}

// GetSnapshot loads one snapshot including its payload.
func (s *Store) GetSnapshot(ctx context.Context, workspaceID, snapshotID uint) (*models.Snapshot, error) {
	var snapshot models.Snapshot
	err := s.db.WithContext(ctx).Where("workspace_id = ? AND id = ?", workspaceID, snapshotID).First(&snapshot).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}

// DeleteSnapshot removes one snapshot.
func (s *Store) DeleteSnapshot(ctx context.Context, workspaceID, snapshotID uint) error {
	result := s.db.WithContext(ctx).Where("workspace_id = ? AND id = ?", workspaceID, snapshotID).Delete(&models.Snapshot{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// CountWorkspaces reports how many workspaces exist.
func (s *Store) CountWorkspaces(ctx context.Context) (int64, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&models.Workspace{}).Count(&count).Error
	return count, err
}

// SeedWorkspace creates the default workspace with the getting-started object
// the legacy app used to create on first load.
func (s *Store) SeedWorkspace(ctx context.Context) (*models.Workspace, error) {
	ws, err := s.CreateWorkspace(ctx, "Ruang Informasi 3D")
	if err != nil {
		return nil, err
	}
	now := nowMillis()
	node := models.Node{
		ID:           models.ID(fmt.Sprintf("%d", now)),
		Title:        "Pusat Arsip Informasi",
		Desc:         "<b>Halo!</b><br>Gunakan pengaturan ruang untuk menyesuaikan area, buat objek, dan tarik garis. Pindahkan tombol <i>Tools</i> agar pandangan Anda lebih leluasa.",
		Labels:       models.JSON(`["pusat","panduan"]`),
		Attachments:  models.JSON(`[]`),
		Shape:        "cube",
		Color:        "#8b5cf6",
		Scale:        1,
		IsStatic:     true,
		CreatedAt:    now,
		LastAccessed: now,
	}
	graph := service.WorkspaceGraph{KnowledgeModelVersion: 2, Nodes: []models.Node{node}}
	if err := s.SaveGraph(ctx, ws, graph); err != nil {
		return nil, err
	}
	return ws, nil
}

func rawOf(j models.JSON) []byte {
	if j.IsNull() {
		return nil
	}
	return j
}

func nullableJSON(j models.JSON) any {
	if j.IsNull() {
		return nil
	}
	return string(j)
}

func nullableRaw(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	return string(raw)
}

func nowMillis() int64 { return time.Now().UnixMilli() }
