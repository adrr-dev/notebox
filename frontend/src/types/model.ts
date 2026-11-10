/**
 * Wire-level data model.
 *
 * These types mirror the JSON the Go backend stores and exchanges. Field names
 * are load-bearing: they are the original workspace envelope schema, so files
 * exported by the legacy single-file app still import here.
 *
 * Optional fields are genuinely optional on the wire (the backend omits zero
 * values); `normalizeNode` / `normalizeEdge` in the store materialize the
 * defaults the UI and the 3D engine rely on.
 */

/** Identifier: nodes use numbers, edges use "edge_..." strings. Compare as strings. */
export type EntityID = number | string;

export type ToolMode = 'pointer' | 'move' | 'connect' | 'delete';

export type NodeShape =
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'icosahedron'
  | 'text3d'
  | 'custom_image'
  | 'graph3d'
  | 'container';

export type GraphKind = 'curve' | 'surface';

/** Per-page reading style of a description page. */
export interface DescStyle {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  textAlign: 'left' | 'justify' | 'center' | 'right';
  maxWidth: string;
  paragraphSpacing: string;
  paragraphIndent: string;
  padding: string;
  useTextColor: boolean;
  textColor: string;
  useBackgroundColor: boolean;
  backgroundColor: string;
}

/** One extra description page. Page 1 lives in `desc` / `pageTitle` / `descStyle`. */
export interface DescPage {
  title: string;
  desc: string;
  style?: DescStyle;
}

export interface Attachment {
  name: string;
  url: string;
  type?: string;
  description?: string;
}

/** Epistemic relation metadata attached to an edge (schema V2). */
export interface EpistemicSourceRef {
  type: 'node' | 'edge';
  id: EntityID;
  unresolved?: boolean;
  titleSnapshot?: string;
}

export interface EpistemicRelation {
  type: string;
  status?: string;
  rationale?: string;
  qualifier?: string;
  customLabel?: string;
  sourceRefs?: EpistemicSourceRef[];
  createdAt?: string;
  updatedAt?: string;
}

/** Fase 2 container payload, stored on nodes with shape "container". */
export interface ContainerPayload {
  size: [number, number, number];
  members: EntityID[];
  mode: 'fixed' | 'fit';
  pad: number;
  layout: 'free' | 'grid' | 'ring' | 'stack' | 'sphere';
  confine: boolean;
  keepOut: boolean;
  opacity: number;
  label: string;
}

export interface UnresolvedContainerMember {
  originalId: EntityID;
  reason: 'merge-id-collision' | 'missing-node';
}

/** Snapshot entry of the per-object revision log. */
export interface RevisionEntry {
  at: number | string;
  title?: string;
  desc?: string;
  pageTitle?: string;
  pages?: DescPage[];
  descStyle?: DescStyle;
  epistemicStatus?: string;
  [key: string]: unknown;
}

export interface NodeRecord {
  id: EntityID;
  title: string;
  desc: string;
  pageTitle: string;
  descStyle?: DescStyle;
  pages?: DescPage[];
  attachments?: Attachment[];
  labels?: string[];
  profileIcon?: string;
  profileGlyph?: string;
  profileImage?: string;
  profileIconColor?: string;
  profileIconBg?: string;
  lastAccessed?: number;
  mathExpression?: string;
  mathValue?: string;
  kind?: string;
  epistemicStatus?: string;
  scope?: string;
  assumptions?: string;
  limitations?: string;
  provenance?: string;
  shape?: NodeShape;
  color?: string;
  textureUrl?: string;
  scale?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  isStatic?: boolean;
  textContent?: string;
  imageBase64?: string;
  graphType?: GraphKind;
  graphFormula?: string;
  graphXMin?: number;
  graphXMax?: number;
  graphYMin?: number;
  graphYMax?: number;
  ctn?: ContainerPayload;
  unresolvedContainerMembers?: UnresolvedContainerMember[];
  revisions?: RevisionEntry[];
  createdAt?: number;
}

export interface EdgeRecord {
  id: EntityID;
  sourceId: EntityID;
  targetId: EntityID;
  relation: string;
  title: string;
  desc: string;
  pageTitle: string;
  descStyle?: DescStyle;
  pages?: DescPage[];
  attachments?: Attachment[];
  labels?: string[];
  profileIcon?: string;
  profileGlyph?: string;
  profileImage?: string;
  profileIconColor?: string;
  profileIconBg?: string;
  lastAccessed?: number;
  mathExpression?: string;
  mathValue?: string;
  epistemicRelation?: EpistemicRelation;
  revisions?: RevisionEntry[];
  createdAt?: number;
}

export interface TrashItem {
  objType: 'node' | 'edge';
  data: NodeRecord | EdgeRecord;
  deletedAt: number;
}

/** Epistemic decision history record (workbench). Stored verbatim. */
export interface EpistemicHistoryRecord {
  id: string;
  recordType: string;
  changeType: string;
  at: string;
  createdAt: string;
  claimRef?: { type: 'node'; id: EntityID };
  claimTitleSnapshot?: string;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  evidenceRefs?: EpistemicSourceRef[];
  learningEpisodeId?: string | null;
  actionCycleId?: string | null;
  previousVersion?: Record<string, unknown>;
  revisedStatement?: string;
  appliedToNode?: boolean;
  [key: string]: unknown;
}

export interface EpisodeEvent {
  id: string;
  sequence: number;
  eventType: string;
  at: string;
  content?: string;
  [key: string]: unknown;
}

export interface LearningEpisodeRecord {
  id: string;
  title: string;
  goal: string;
  status: 'open' | 'reviewing' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  targetRefs?: EpistemicSourceRef[];
  initialUnderstanding?: string;
  attemptSummary?: string;
  feedbackSummary?: string;
  changeInUnderstanding?: string;
  unresolvedQuestions?: string;
  evidenceRefs?: EpistemicSourceRef[];
  relatedHistoryIds?: string[];
  actionCycleIds?: string[];
  events?: EpisodeEvent[];
  [key: string]: unknown;
}

export interface ActionCycleRecord {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  targetRefs?: EpistemicSourceRef[];
  goal?: string;
  plan?: string;
  prediction?: string;
  observation?: string;
  evaluation?: string;
  evidenceRefs?: EpistemicSourceRef[];
  learningEpisodeId?: string | null;
  relatedHistoryIds?: string[];
  [key: string]: unknown;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

/** Guided tour payload (verbatim from the legacy app). */
export interface TourStep {
  ref: { type: 'node' | 'edge'; id: EntityID };
  title: string;
  note: string;
  dwell: number;
  cam?: { p: [number, number, number]; t: [number, number, number] };
}

export interface TourState {
  version: number;
  cfg: { style: 'arc' | 'line' | 'cut'; dur: number; dist: number; panel: boolean; loop: boolean };
  steps: TourStep[];
}

/** Fase 2 physics/cluster state (verbatim). */
export interface Fase2State {
  physics?: Record<string, unknown>;
  cluster?: Record<string, unknown>;
  assign?: Record<string, number>;
  origColor?: Record<string, string>;
  clusters?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** The full graph document the client loads and saves. */
export interface GraphPayload {
  knowledgeModelVersion: number;
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  trash: TrashItem[];
  epistemicHistory: EpistemicHistoryRecord[];
  learningEpisodes: LearningEpisodeRecord[];
  actionCycles: ActionCycleRecord[];
  camera: CameraState | null;
  tour: TourState | null;
  fase2: Fase2State | null;
}

/** The export/import envelope. */
export interface WorkspaceEnvelope extends Partial<GraphPayload> {
  app: string;
  version: number;
  formatVersion: number;
  exportedAt?: string;
  scope: 'all' | 'selection';
}

export interface WorkspaceSummary {
  id: number;
  name: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
}

export interface WorkspaceFull extends WorkspaceSummary {
  formatVersion: number;
  knowledgeModelVersion: number;
  camera?: CameraState | null;
  tour?: TourState | null;
  fase2?: Fase2State | null;
  trash?: TrashItem[] | null;
  epistemicHistory?: EpistemicHistoryRecord[] | null;
  learningEpisodes?: LearningEpisodeRecord[] | null;
  actionCycles?: ActionCycleRecord[] | null;
  nodes: NodeRecord[];
  edges: EdgeRecord[];
}

export interface SnapshotSummary {
  id: number;
  workspaceId: number;
  autosaveVersion: number;
  reason: string;
  bytes: number;
  savedAt: string;
}

export interface ImportOutcome {
  mode: 'merge' | 'replace';
  rule: string;
  addedNodes: number;
  addedEdges: number;
  remapped: boolean;
  warnings: string[];
  nodeCount: number;
  edgeCount: number;
  migratedFromKnowledgeModelVersion?: number;
  knowledgeModelVersion?: number;
}

export interface ApiIssue {
  code: string;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}
