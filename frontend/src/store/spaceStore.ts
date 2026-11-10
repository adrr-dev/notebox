/**
 * Space appearance settings: the grid, axes, fog and camera limits of the 3D
 * room. These are view preferences, not workspace content, so they live outside
 * the graph document; the engine subscribes and applies them live.
 */
import { create } from 'zustand';

export interface SpaceSettings {
  /** Extent of the reference grid in units (grid spans ±size). */
  gridSize: number;
  /** World-space Y of the ground grid. */
  gridY: number;
  /** Fog toggle and density. */
  fogEnabled: boolean;
  fogDensity: number;
  /** Which grid planes are drawn. */
  planeXZ: boolean;
  planeXY: boolean;
  planeYZ: boolean;
  /** Axis labels and per-node drop lines. */
  axisLabels: boolean;
  dropLines: boolean;
  /** OrbitControls distance limit. */
  maxDistance: number;
  /** Voxel reference grid (visual density guide). */
  voxelVisible: boolean;
  voxelCellSize: number;
  /** Ambient/directional light scale, 0–1.5. */
  ambientLight: number;
  directionalLight: number;
}

export const DEFAULT_SPACE_SETTINGS: SpaceSettings = {
  gridSize: 50,
  gridY: 0,
  fogEnabled: true,
  fogDensity: 0.015,
  planeXZ: true,
  planeXY: false,
  planeYZ: false,
  axisLabels: true,
  dropLines: true,
  maxDistance: 100,
  voxelVisible: false,
  voxelCellSize: 5,
  ambientLight: 0.7,
  directionalLight: 0.8,
};

interface SpaceStoreState extends SpaceSettings {
  set: (patch: Partial<SpaceSettings>) => void;
  reset: () => void;
}

export const useSpaceStore = create<SpaceStoreState>((set) => ({
  ...DEFAULT_SPACE_SETTINGS,
  set: (patch) => set(patch),
  reset: () => set({ ...DEFAULT_SPACE_SETTINGS }),
}));
