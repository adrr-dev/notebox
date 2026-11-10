/**
 * Keeps the variable engine in sync with the workspace graph.
 *
 * Subscribes to `useAppStore`, waits 120 ms after the last edit and hands the
 * newest `nodes` / `edges` arrays to `useFormulaStore`. Only array *identity*
 * changes are relevant, so unrelated store updates (toasts, selection, camera)
 * cost one comparison.
 *
 * Re-entrancy: `recompute` writes `mathValue` back onto the nodes, which
 * produces a fresh `nodes` array and would normally re-trigger this bridge.
 * The chain always terminates after one extra pass, because the second
 * recalculation is a fixed point (it only reads `mathExpression`) and
 * `applyMathValues` skips the store write when no value changed — so no
 * endless recomputation is possible.
 */
import { useAppStore } from '../../store/appStore';
import { useFormulaStore } from './formulaStore';

const DEBOUNCE_MS = 120;

/** Starts the bridge and returns the function that stops it. */
export function startRecomputeBridge(): () => void {
  let timer: number | null = null;
  let lastNodes = useAppStore.getState().nodes;
  let lastEdges = useAppStore.getState().edges;

  const flush = () => {
    timer = null;
    const { nodes, edges } = useAppStore.getState();
    // Compares against the arrays of the previous run, so a flush triggered by
    // our own `mathValue` write still recalculates once (it is cheap and
    // idempotent) but a no-change update is skipped.
    if (nodes === lastNodes && edges === lastEdges) return;
    lastNodes = nodes;
    lastEdges = edges;
    useFormulaStore.getState().recompute(nodes, edges);
  };

  const unsubscribe = useAppStore.subscribe((state, previousState) => {
    if (state.nodes === previousState.nodes && state.edges === previousState.edges) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(flush, DEBOUNCE_MS);
  });

  // Seed the engine once so flow visualisations have data before the first edit.
  useFormulaStore.getState().recompute(useAppStore.getState().nodes, useAppStore.getState().edges);

  return () => {
    unsubscribe();
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
}
