package models

import "time"

// Workspace is one knowledge space. Single-user product: the server stores one
// or more workspaces and the client works on the active one.
type Workspace struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	Name                  string    `gorm:"not null" json:"name"`
	FormatVersion         int       `gorm:"not null;default:1" json:"formatVersion"`
	KnowledgeModelVersion int       `gorm:"not null;default:2" json:"knowledgeModelVersion"`
	Camera                JSON      `gorm:"type:text" json:"camera,omitempty"`
	Tour                  JSON      `gorm:"type:text" json:"tour,omitempty"`
	Fase2                 JSON      `gorm:"type:text" json:"fase2,omitempty"`
	Trash                 JSON      `gorm:"type:text" json:"trash,omitempty"`
	EpistemicHistory      JSON      `gorm:"type:text" json:"epistemicHistory,omitempty"`
	LearningEpisodes      JSON      `gorm:"type:text" json:"learningEpisodes,omitempty"`
	ActionCycles          JSON      `gorm:"type:text" json:"actionCycles,omitempty"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

// Node is one object in the 3D space: an information card with an epistemic
// annotation, a visual appearance and a position. Nested collections stay JSON
// because the client owns their inner shape (they are edited as whole documents).
type Node struct {
	ID          ID   `gorm:"primaryKey;column:id;type:text" json:"id"`
	WorkspaceID uint `gorm:"primaryKey;column:workspace_id;index" json:"-"`

	Title     string `json:"title"`
	Desc      string `gorm:"type:text" json:"desc"`
	PageTitle string `json:"pageTitle"`
	DescStyle JSON   `gorm:"type:text" json:"descStyle,omitempty"`
	Pages     JSON   `gorm:"type:text" json:"pages,omitempty"`

	Attachments JSON `gorm:"type:text" json:"attachments,omitempty"`
	Labels      JSON `gorm:"type:text" json:"labels,omitempty"`

	ProfileIcon      string `json:"profileIcon,omitempty"`
	ProfileGlyph     string `json:"profileGlyph,omitempty"`
	ProfileImage     string `gorm:"type:text" json:"profileImage,omitempty"`
	ProfileIconColor string `json:"profileIconColor,omitempty"`
	ProfileIconBg    string `json:"profileIconBg,omitempty"`

	LastAccessed   int64  `json:"lastAccessed,omitempty"`
	MathExpression string `json:"mathExpression,omitempty"`
	MathValue      string `json:"mathValue,omitempty"`

	Kind            string `json:"kind,omitempty"`
	EpistemicStatus string `json:"epistemicStatus,omitempty"`
	Scope           string `json:"scope,omitempty"`
	Assumptions     string `gorm:"type:text" json:"assumptions,omitempty"`
	Limitations     string `gorm:"type:text" json:"limitations,omitempty"`
	Provenance      string `gorm:"type:text" json:"provenance,omitempty"`

	Shape      string  `json:"shape,omitempty"`
	Color      string  `json:"color,omitempty"`
	TextureURL string  `gorm:"type:text" json:"textureUrl,omitempty"`
	Scale      float64 `json:"scale,omitempty"`
	PosX       float64 `json:"posX,omitempty"`
	PosY       float64 `json:"posY,omitempty"`
	PosZ       float64 `json:"posZ,omitempty"`
	IsStatic   bool    `json:"isStatic,omitempty"`

	TextContent string `gorm:"type:text" json:"textContent,omitempty"`
	ImageBase64 string `gorm:"type:text" json:"imageBase64,omitempty"`

	GraphType    string  `json:"graphType,omitempty"`
	GraphFormula string  `gorm:"type:text" json:"graphFormula,omitempty"`
	GraphXMin    float64 `json:"graphXMin,omitempty"`
	GraphXMax    float64 `json:"graphXMax,omitempty"`
	GraphYMin    float64 `json:"graphYMin,omitempty"`
	GraphYMax    float64 `json:"graphYMax,omitempty"`

	// Ctn holds the Fase 2 container payload for shape="container" nodes.
	Ctn JSON `gorm:"type:text" json:"ctn,omitempty"`
	// UnresolvedContainerMembers records import-time reconciliation hints.
	UnresolvedContainerMembers JSON `gorm:"type:text" json:"unresolvedContainerMembers,omitempty"`
	// Revisions is the per-object snapshot log (newest first, capped client-side).
	Revisions JSON `json:"revisions,omitempty"`

	CreatedAt int64 `json:"createdAt,omitempty"`
}

// Edge is a relation between two nodes. It carries the same card metadata as a
// node plus a symbolic relation symbol and the epistemic relation annotation.
type Edge struct {
	ID          ID     `gorm:"primaryKey;column:id;type:text" json:"id"`
	WorkspaceID uint   `gorm:"primaryKey;column:workspace_id;index" json:"-"`
	SourceID    ID     `gorm:"column:source_id;type:text;index" json:"sourceId"`
	TargetID    ID     `gorm:"column:target_id;type:text;index" json:"targetId"`
	Relation    string `json:"relation"`

	Title     string `json:"title"`
	Desc      string `gorm:"type:text" json:"desc"`
	PageTitle string `json:"pageTitle"`
	DescStyle JSON   `gorm:"type:text" json:"descStyle,omitempty"`
	Pages     JSON   `gorm:"type:text" json:"pages,omitempty"`

	Attachments JSON `gorm:"type:text" json:"attachments,omitempty"`
	Labels      JSON `gorm:"type:text" json:"labels,omitempty"`

	ProfileIcon      string `json:"profileIcon,omitempty"`
	ProfileGlyph     string `json:"profileGlyph,omitempty"`
	ProfileImage     string `gorm:"type:text" json:"profileImage,omitempty"`
	ProfileIconColor string `json:"profileIconColor,omitempty"`
	ProfileIconBg    string `json:"profileIconBg,omitempty"`

	LastAccessed   int64  `json:"lastAccessed,omitempty"`
	MathExpression string `json:"mathExpression,omitempty"`
	MathValue      string `json:"mathValue,omitempty"`

	EpistemicRelation   JSON `gorm:"column:epistemic_relation;type:text" json:"epistemicRelation,omitempty"`
	UnresolvedEndpoints JSON `gorm:"type:text" json:"unresolvedEndpoints,omitempty"`
	Revisions           JSON `json:"revisions,omitempty"`

	CreatedAt int64 `json:"createdAt,omitempty"`
}

// Snapshot is a whole-workspace recovery point. The payload is the same
// envelope the export endpoint produces.
type Snapshot struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	WorkspaceID     uint      `gorm:"index" json:"workspaceId"`
	AutosaveVersion int       `gorm:"not null" json:"autosaveVersion"`
	Reason          string    `json:"reason"`
	Bytes           int64     `json:"bytes"`
	Payload         JSON      `gorm:"type:text" json:"payload,omitempty"`
	SavedAt         time.Time `json:"savedAt"`
}

// WorkspaceSummary is the list-item projection of a workspace.
type WorkspaceSummary struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	NodeCount int64     `json:"nodeCount"`
	EdgeCount int64     `json:"edgeCount"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// WorkspaceFull is the complete state the client boots from.
type WorkspaceFull struct {
	Workspace
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}
