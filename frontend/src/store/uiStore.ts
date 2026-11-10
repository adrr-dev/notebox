/**
 * Application-wide UI flags that do not belong to the workspace document:
 * which modal is open, tool drawer state, snap-to-grid, and so on.
 *
 * Features toggle these flags; App.tsx renders the corresponding surfaces.
 */
import { create } from 'zustand';

/** Every surface flag, in the order they appear in the state object. */
export const SURFACE_FLAGS = [
  'searchOpen',
  'dataIoOpen',
  'spaceSettingsOpen',
  'syntaxDictOpen',
  'mathEvaluatorOpen',
  'globalVarsOpen',
  'trashOpen',
  'shortcutsOpen',
] as const;

export type SurfaceFlag = (typeof SURFACE_FLAGS)[number];
type SurfaceFlags = Record<SurfaceFlag, boolean>;

export type UiSurface =
  | 'search'
  | 'dataIo'
  | 'spaceSettings'
  | 'syntaxDict'
  | 'mathEvaluator'
  | 'globalVars'
  | 'trash'
  | 'shortcuts';

const SURFACE_KEYS: Record<UiSurface, SurfaceFlag> = {
  search: 'searchOpen',
  dataIo: 'dataIoOpen',
  spaceSettings: 'spaceSettingsOpen',
  syntaxDict: 'syntaxDictOpen',
  mathEvaluator: 'mathEvaluatorOpen',
  globalVars: 'globalVarsOpen',
  trash: 'trashOpen',
  shortcuts: 'shortcutsOpen',
};

function allSurfacesClosed(): SurfaceFlags {
  return {
    searchOpen: false,
    dataIoOpen: false,
    spaceSettingsOpen: false,
    syntaxDictOpen: false,
    mathEvaluatorOpen: false,
    globalVarsOpen: false,
    trashOpen: false,
    shortcutsOpen: false,
  };
}

export interface UiState extends SurfaceFlags {
  /** Tools. */
  snapEnabled: boolean;
  toolsExpanded: boolean;
  /** Whether the minimap panel is shown at all. */
  minimapVisible: boolean;

  toggleSnap: () => void;
  setToolsExpanded: (expanded: boolean) => void;
  /** Opens one surface and closes every other one. */
  open: (surface: UiSurface) => void;
  close: (surface: UiSurface) => void;
  closeAll: () => void;
  setMinimapVisible: (visible: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  ...allSurfacesClosed(),

  snapEnabled: false,
  toolsExpanded: false,
  minimapVisible: true,

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setToolsExpanded: (toolsExpanded) => set({ toolsExpanded }),

  open: (surface) =>
    set(() => {
      const next = allSurfacesClosed();
      next[SURFACE_KEYS[surface]] = true;
      return next;
    }),

  close: (surface) =>
    set(() => {
      switch (surface) {
        case 'search':
          return { searchOpen: false };
        case 'dataIo':
          return { dataIoOpen: false };
        case 'spaceSettings':
          return { spaceSettingsOpen: false };
        case 'syntaxDict':
          return { syntaxDictOpen: false };
        case 'mathEvaluator':
          return { mathEvaluatorOpen: false };
        case 'globalVars':
          return { globalVarsOpen: false };
        case 'trash':
          return { trashOpen: false };
        case 'shortcuts':
          return { shortcutsOpen: false };
      }
    }),

  closeAll: () => set(() => allSurfacesClosed()),

  setMinimapVisible: (minimapVisible) => set({ minimapVisible }),
}));

/** Reports whether any modal surface is open (used by keyboard shortcuts). */
export function anySurfaceOpen(state: UiState): boolean {
  return SURFACE_FLAGS.some((flag) => state[flag]);
}
