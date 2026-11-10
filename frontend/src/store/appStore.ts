/**
 * Application store.
 *
 * One zustand store owns the whole workspace document (the same shape the Go
 * backend persists) plus transient UI state. Mutations are immutable updates so
 * the 3D engine can detect changes by object identity; every graph mutation
 * marks the store dirty and triggers the debounced autosave.
 *
 * The store deliberately has no three.js dependency: the engine subscribes to
 * it (`useAppStore.subscribe`) and syncs meshes from the data.
 */
import { create } from 'zustand';
import * as api from '../api/client';
import {
  DEFAULT_DESC_STYLE,
  normalizeEdge,
  normalizeNode,
} from './normalize';
import type {
  ActionCycleRecord,
  CameraState,
  DescStyle,
  EdgeRecord,
  EntityID,
  EpistemicHistoryRecord,
  Fase2State,
  GraphPayload,
  LearningEpisodeRecord,
  NodeRecord,
  ToolMode,
  TourState,
  TrashItem,
  WorkspaceFull,
} from '../types/model';

export { DEFAULT_DESC_STYLE } from './normalize';

/** Autosave debounce, mirroring the legacy local-persistence cadence. */
export const SAVE_DELAY_MS = 900;

export interface UiPreferences {
  hints: boolean;
  minimap: boolean;
  minimapCollapsed: boolean;
  minimapView: 'top' | 'front' | 'side';
  labelCollision: boolean;
  touchGestures: boolean;
}

export const DEFAULT_UI: UiPreferences = {
  hints: true,
  minimap: true,
  minimapCollapsed: false,
  minimapView: 'top',
  labelCollision: true,
  touchGestures: true,
};

export interface ToastMessage {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface EditorTarget {
  type: 'node' | 'edge';
  id: EntityID | null;
}

export interface ViewTarget {
  type: 'node' | 'edge';
  id: EntityID;
}

export interface FocusTarget {
  type: 'node' | 'edge';
  id: EntityID;
}

export interface AppState {
  // Boot
  status: 'booting' | 'ready' | 'error';
  bootError: string | null;
  workspaceId: number | null;
  workspaceName: string;

  // Workspace document
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

  // UI state
  mode: ToolMode;
  connectSourceId: EntityID | null;
  editing: EditorTarget | null;
  viewing: ViewTarget | null;
  focus: FocusTarget | null;
  ui: UiPreferences;
  toasts: ToastMessage[];

  // Persistence bookkeeping
  dirty: boolean;
  saveState: SaveState;
  lastSavedAt: number | null;
  saveError: string | null;

  // Lifecycle
  boot: (workspaceId?: number) => Promise<void>;
  applyWorkspace: (workspace: WorkspaceFull) => void;
  applyGraphPayload: (payload: Partial<GraphPayload>) => void;

  // Graph mutations
  addNode: (partial: Partial<NodeRecord>) => NodeRecord;
  updateNode: (id: EntityID, patch: Partial<NodeRecord>) => void;
  patchNodePosition: (id: EntityID, posX: number, posY: number, posZ: number) => void;
  /** Bulk position update used by auto-arrange, physics and imports. */
  applyPositions: (positions: Record<string, readonly [number, number, number]>) => void;
  deleteNode: (id: EntityID, permanent: boolean) => void;
  addEdge: (sourceId: EntityID, targetId: EntityID) => EdgeRecord;
  updateEdge: (id: EntityID, patch: Partial<EdgeRecord>) => void;
  deleteEdge: (id: EntityID, permanent: boolean) => void;
  restoreTrashItem: (index: number) => boolean;
  purgeTrashItem: (index: number) => void;
  emptyTrash: () => void;

  // Epistemic collections (kept verbatim; used by the workbench feature)
  setEpistemicHistory: (records: EpistemicHistoryRecord[]) => void;
  setLearningEpisodes: (records: LearningEpisodeRecord[]) => void;
  setActionCycles: (records: ActionCycleRecord[]) => void;
  /** Writes computed formula results (mathValue) back onto nodes. */
  applyMathValues: (values: Record<string, string>) => void;

  // UI actions
  setMode: (mode: ToolMode) => void;
  setConnectSource: (id: EntityID | null) => void;
  openEditor: (type: 'node' | 'edge', id: EntityID | null) => void;
  closeEditor: () => void;
  openViewer: (type: 'node' | 'edge', id: EntityID) => void;
  closeViewer: () => void;
  setFocus: (target: FocusTarget | null) => void;
  setUi: (patch: Partial<UiPreferences>) => void;
  pushToast: (message: string, kind?: ToastMessage['kind']) => void;
  dismissToast: (id: number) => void;

  // Persistence
  setCamera: (camera: CameraState | null) => void;
  markDirty: () => void;
  scheduleSave: () => void;
  saveNow: (reason?: string) => Promise<void>;
  snapshotNow: (reason: string) => Promise<void>;
  buildGraphPayload: () => GraphPayload;
}

let toastSeq = 0;
let saveTimer: number | null = null;
/** Guards autosave while the store is being hydrated from the server. */
let hydrating = false;

/** Collects every label used in the workspace, sorted, for datalists/filters. */
export function collectLabels(nodes: NodeRecord[], edges: EdgeRecord[]): string[] {
  const labels = new Set<string>();
  for (const item of [...nodes, ...edges]) {
    for (const label of item.labels ?? []) {
      const trimmed = String(label).trim();
      if (trimmed) labels.add(trimmed);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'id'));
}

/** Next free numeric node id: millisecond clock, advanced past collisions. */
export function nextNodeId(nodes: NodeRecord[], trash: TrashItem[]): number {
  const used = new Set<string>();
  for (const n of nodes) used.add(String(n.id));
  for (const t of trash) used.add(String(t.data.id));
  let id = Date.now();
  while (used.has(String(id))) id += 1;
  return id;
}

/** Next free edge id, following the legacy "edge_<clock>" convention. */
export function nextEdgeId(edges: EdgeRecord[], trash: TrashItem[]): string {
  const used = new Set<string>();
  for (const e of edges) used.add(String(e.id));
  for (const t of trash) used.add(String(t.data.id));
  const base = `edge_${Date.now()}`;
  if (!used.has(base)) return base;
  let suffix = 1;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

/** Strips runtime-only fields before a record is persisted. */
function plainRecord<T extends NodeRecord | EdgeRecord>(record: T): T {
  const { ...rest } = record;
  return rest;
}

export const useAppStore = create<AppState>((set, get) => {
  /** Applies a graph mutation and schedules the autosave. */
  const commit = (partial: Partial<AppState>, options: { dirty?: boolean } = {}) => {
    set(partial as Partial<AppState>);
    if (options.dirty !== false && !hydrating) {
      get().markDirty();
      get().scheduleSave();
    }
  };

  return {
    status: 'booting',
    bootError: null,
    workspaceId: null,
    workspaceName: 'Ruang Informasi 3D',

    knowledgeModelVersion: 2,
    nodes: [],
    edges: [],
    trash: [],
    epistemicHistory: [],
    learningEpisodes: [],
    actionCycles: [],
    camera: null,
    tour: null,
    fase2: null,

    mode: 'pointer',
    connectSourceId: null,
    editing: null,
    viewing: null,
    focus: null,
    ui: DEFAULT_UI,
    toasts: [],

    dirty: false,
    saveState: 'idle',
    lastSavedAt: null,
    saveError: null,

    boot: async (workspaceId) => {
      hydrating = true;
      try {
        let id = workspaceId;
        if (!id) {
          const list = await api.listWorkspaces();
          id = list[0]?.id ?? (await api.createWorkspace('Ruang Informasi 3D')).id;
        }
        const workspace = await api.getWorkspace(id);
        get().applyWorkspace(workspace);
        set({ status: 'ready', bootError: null });
      } catch (error) {
        set({ status: 'error', bootError: error instanceof Error ? error.message : String(error) });
      } finally {
        hydrating = false;
      }
    },

    applyWorkspace: (workspace) => {
      set({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        knowledgeModelVersion: workspace.knowledgeModelVersion ?? 2,
        nodes: (workspace.nodes ?? []).map(normalizeNode),
        edges: (workspace.edges ?? []).map(normalizeEdge),
        trash: workspace.trash ?? [],
        epistemicHistory: workspace.epistemicHistory ?? [],
        learningEpisodes: workspace.learningEpisodes ?? [],
        actionCycles: workspace.actionCycles ?? [],
        camera: workspace.camera ?? null,
        tour: workspace.tour ?? null,
        fase2: workspace.fase2 ?? null,
        dirty: false,
        saveState: 'idle',
        saveError: null,
      });
    },

    applyGraphPayload: (payload) => {
      set((state) => ({
        knowledgeModelVersion: payload.knowledgeModelVersion ?? state.knowledgeModelVersion,
        nodes: (payload.nodes ?? state.nodes).map(normalizeNode),
        edges: (payload.edges ?? state.edges).map(normalizeEdge),
        trash: payload.trash ?? state.trash,
        epistemicHistory: payload.epistemicHistory ?? state.epistemicHistory,
        learningEpisodes: payload.learningEpisodes ?? state.learningEpisodes,
        actionCycles: payload.actionCycles ?? state.actionCycles,
        camera: payload.camera ?? state.camera,
        tour: payload.tour ?? state.tour,
        fase2: payload.fase2 ?? state.fase2,
      }));
      get().markDirty();
      get().scheduleSave();
    },

    addNode: (partial) => {
      const state = get();
      const now = Date.now();
      const node = normalizeNode({
        title: partial.title ?? 'Tanpa Judul',
        desc: partial.desc ?? '',
        pageTitle: partial.pageTitle ?? '',
        descStyle: partial.descStyle ?? { ...DEFAULT_DESC_STYLE },
        pages: partial.pages ?? [],
        attachments: partial.attachments ?? [],
        labels: partial.labels ?? [],
        kind: partial.kind ?? 'note',
        epistemicStatus: partial.epistemicStatus ?? 'unreviewed',
        shape: partial.shape ?? 'icosahedron',
        color: partial.color ?? '#3b82f6',
        scale: partial.scale ?? 1,
        isStatic: partial.isStatic ?? false,
        createdAt: partial.createdAt ?? now,
        lastAccessed: partial.lastAccessed ?? now,
        ...partial,
        id: partial.id ?? nextNodeId(state.nodes, state.trash),
      });
      commit({ nodes: [...state.nodes, node] });
      return node;
    },

    updateNode: (id, patch) => {
      const key = String(id);
      const nodes = get().nodes.map((node) =>
        String(node.id) === key ? normalizeNode({ ...node, ...patch }) : node,
      );
      commit({ nodes });
    },

    patchNodePosition: (id, posX, posY, posZ) => {
      const key = String(id);
      const nodes = get().nodes.map((node) =>
        String(node.id) === key ? { ...node, posX, posY, posZ } : node,
      );
      commit({ nodes });
    },

    applyPositions: (positions) => {
      const entries = Object.entries(positions);
      if (entries.length === 0) return;
      let changed = false;
      const nodes = get().nodes.map((node) => {
        const target = positions[String(node.id)];
        if (!target) return node;
        const [x, y, z] = target;
        if (node.posX === x && node.posY === y && node.posZ === z) return node;
        changed = true;
        return { ...node, posX: x, posY: y, posZ: z };
      });
      if (changed) commit({ nodes });
    },

    deleteNode: (id, permanent) => {
      const state = get();
      const key = String(id);
      const node = state.nodes.find((n) => String(n.id) === key);
      if (!node) return;
      const attached = state.edges.filter(
        (edge) => String(edge.sourceId) === key || String(edge.targetId) === key,
      );
      const nodes = state.nodes.filter((n) => String(n.id) !== key);
      const edges = state.edges.filter(
        (edge) => String(edge.sourceId) !== key && String(edge.targetId) !== key,
      );
      if (permanent) {
        // Permanent deletion drops the object and its relations for good.
        const attachedIds = new Set(attached.map((edge) => String(edge.id)));
        commit({
          nodes,
          edges,
          trash: state.trash.filter((item) => {
            const itemId = String(item.data.id);
            return itemId !== key && !attachedIds.has(itemId);
          }),
        });
        return;
      }
      const now = Date.now();
      const trash: TrashItem[] = [
        ...state.trash,
        { objType: 'node', data: plainRecord(node), deletedAt: now },
        ...attached.map((edge) => ({ objType: 'edge' as const, data: plainRecord(edge), deletedAt: now })),
      ];
      commit({ nodes, edges, trash });
    },

    addEdge: (sourceId, targetId) => {
      const state = get();
      const edge = normalizeEdge({
        id: nextEdgeId(state.edges, state.trash),
        sourceId,
        targetId,
        relation: 'none',
        title: 'Koneksi Baru',
        desc: '',
        pageTitle: '',
        descStyle: { ...DEFAULT_DESC_STYLE },
        pages: [],
        attachments: [],
        labels: [],
        createdAt: Date.now(),
      });
      commit({ edges: [...state.edges, edge] });
      return edge;
    },

    updateEdge: (id, patch) => {
      const key = String(id);
      const edges = get().edges.map((edge) =>
        String(edge.id) === key ? normalizeEdge({ ...edge, ...patch }) : edge,
      );
      commit({ edges });
    },

    deleteEdge: (id, permanent) => {
      const state = get();
      const key = String(id);
      const edge = state.edges.find((e) => String(e.id) === key);
      if (!edge) return;
      const edges = state.edges.filter((e) => String(e.id) !== key);
      if (permanent) {
        commit({
          edges,
          trash: state.trash.filter((item) => String(item.data.id) !== key),
        });
        return;
      }
      commit({
        edges,
        trash: [...state.trash, { objType: 'edge', data: plainRecord(edge), deletedAt: Date.now() }],
      });
    },

    restoreTrashItem: (index) => {
      const state = get();
      const item = state.trash[index];
      if (!item) return false;
      const id = String(item.data.id);
      const collision =
        state.nodes.some((n) => String(n.id) === id) || state.edges.some((e) => String(e.id) === id);
      if (collision) {
        get().pushToast('Tidak dapat memulihkan: masih ada objek aktif dengan ID yang sama.', 'error');
        return false;
      }
      const trash = state.trash.filter((_, i) => i !== index);
      if (item.objType === 'node') {
        const node = normalizeNode(item.data as NodeRecord);
        commit({ nodes: [...state.nodes, node], trash });
        get().pushToast('Objek dipulihkan dari tempat sampah.', 'success');
        return true;
      }
      const edge = normalizeEdge(item.data as EdgeRecord);
      const endpointsExist =
        state.nodes.some((n) => String(n.id) === String(edge.sourceId)) &&
        state.nodes.some((n) => String(n.id) === String(edge.targetId));
      if (!endpointsExist) {
        get().pushToast('Garis tidak dapat dipulihkan: salah satu ujungnya belum ada.', 'error');
        return false;
      }
      commit({ edges: [...state.edges, edge], trash });
      get().pushToast('Garis dipulihkan dari tempat sampah.', 'success');
      return true;
    },

    purgeTrashItem: (index) => {
      const state = get();
      const trash = state.trash.filter((_, i) => i !== index);
      commit({ trash });
    },

    emptyTrash: () => {
      commit({ trash: [] });
      get().pushToast('Tempat sampah dikosongkan.', 'success');
    },

    setEpistemicHistory: (records) => commit({ epistemicHistory: records }),
    setLearningEpisodes: (records) => commit({ learningEpisodes: records }),
    setActionCycles: (records) => commit({ actionCycles: records }),

    applyMathValues: (values) => {
      const entries = Object.entries(values);
      if (entries.length === 0) return;
      let changed = false;
      const nodes = get().nodes.map((node) => {
        const key = String(node.id);
        if (!(key in values)) return node;
        const next = values[key] ?? '';
        if ((node.mathValue ?? '') === next) return node;
        changed = true;
        return { ...node, mathValue: next };
      });
      if (changed) commit({ nodes });
    },

    setMode: (mode) => set({ mode, connectSourceId: null }),
    setConnectSource: (id) => set({ connectSourceId: id }),
    openEditor: (type, id) => set({ editing: { type, id }, viewing: null }),
    closeEditor: () => set({ editing: null }),
    openViewer: (type, id) => set({ viewing: { type, id }, editing: null }),
    closeViewer: () => set({ viewing: null }),
    setFocus: (target) => set({ focus: target }),
    setUi: (patch) => set((state) => ({ ui: { ...state.ui, ...patch } })),

    pushToast: (message, kind = 'info') => {
      const toast: ToastMessage = { id: ++toastSeq, message, kind };
      set((state) => ({ toasts: [...state.toasts, toast] }));
      setTimeout(() => get().dismissToast(toast.id), 4200);
    },

    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

    setCamera: (camera) => {
      set({ camera });
      if (!hydrating) {
        get().markDirty();
        get().scheduleSave();
      }
    },

    markDirty: () => set({ dirty: true }),

    scheduleSave: () => {
      clearTimeout(saveTimer ?? undefined);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void get().saveNow('autosave');
      }, SAVE_DELAY_MS);
    },

    saveNow: async (reason = 'manual') => {
      const state = get();
      if (!state.workspaceId || !state.dirty) return;
      set({ saveState: 'saving', saveError: null });
      try {
        await api.putGraph(state.workspaceId, state.buildGraphPayload());
        set({ saveState: 'saved', dirty: false, lastSavedAt: Date.now(), saveError: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ saveState: 'error', saveError: message });
        get().pushToast(`Gagal menyimpan (${reason}): ${message}`, 'error');
      }
    },

    snapshotNow: async (reason) => {
      const state = get();
      if (!state.workspaceId) return;
      try {
        await api.createSnapshot(state.workspaceId, reason);
        get().pushToast('Snapshot pemulihan disimpan di server.', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        get().pushToast(`Gagal membuat snapshot: ${message}`, 'error');
      }
    },

    buildGraphPayload: () => {
      const state = get();
      return {
        knowledgeModelVersion: state.knowledgeModelVersion,
        nodes: state.nodes.map(plainRecord),
        edges: state.edges.map(plainRecord),
        trash: state.trash,
        epistemicHistory: state.epistemicHistory,
        learningEpisodes: state.learningEpisodes,
        actionCycles: state.actionCycles,
        camera: state.camera,
        tour: state.tour,
        fase2: state.fase2,
      };
    },
  };
});

/** Convenience selectors. */
export const selectNodeById = (id: EntityID | null | undefined) => (state: AppState) =>
  id === null || id === undefined ? undefined : state.nodes.find((n) => String(n.id) === String(id));

export const selectEdgeById = (id: EntityID | null | undefined) => (state: AppState) =>
  id === null || id === undefined ? undefined : state.edges.find((e) => String(e.id) === String(id));

export const selectAllLabels = (state: AppState) => collectLabels(state.nodes, state.edges);

/** Desc style used by new pages and as the normalization fallback. */
export type { DescStyle };
