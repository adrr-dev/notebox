/**
 * Zustand slice holding the latest variable-system calculation.
 *
 * The graph itself stays in `useAppStore`; this store keeps only the derived
 * state so surfaces like the global variables modal can read it without
 * re-running the engine.
 */
import { create } from 'zustand';
import { useAppStore } from '../../store/appStore';
import type { EdgeRecord, NodeRecord } from '../../types/model';
import { recalculateWorkspace, type StateEngine } from './recalc';

export interface FormulaState {
  state: StateEngine;
  /** Recalculates the workspace and writes the computed `mathValue`s back to the graph. */
  recompute: (nodes: NodeRecord[], edges: EdgeRecord[]) => void;
}

const EMPTY_STATE: StateEngine = { localDefs: {}, globalList: [], unresolvedList: [], edgeFlow: {} };

export const useFormulaStore = create<FormulaState>((set) => ({
  state: EMPTY_STATE,

  recompute: (nodes, edges) => {
    const { mathValues, state } = recalculateWorkspace(nodes, edges);
    // `applyMathValues` only commits when a value actually changed; that no-op
    // is what stops the recompute bridge from looping on its own writes.
    useAppStore.getState().applyMathValues(mathValues);
    set({ state });
  },
}));
