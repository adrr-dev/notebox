/**
 * Workspace-wide variable engine.
 *
 * Objects define variables through their Math Expression field (`x = 3`);
 * objects connected by an edge can then read those variables in their own
 * expression — a spreadsheet-like fixed-point recalculation.
 *
 * Ported from the legacy single-file app:
 *  - `keyOf` / `getNeighbors` (legacy L7677-7696)
 *  - `recalcGlobalSystem` (legacy L7734-7888), including the
 *    `entities.length + 1`-pass fixed point of Fase 4.
 *
 * The engine is pure with respect to its inputs: nothing is mutated, the
 * returned records carry the results, and no exception escapes.
 */
import * as math from 'mathjs';
import type { EdgeRecord, NodeRecord } from '../../types/model';
import { describeEvalError, extractFormulaSymbols, formatMathResult, type FormulaSymbols } from './evaluate';

export type EntityType = 'node' | 'edge';

/** One variable defined by an object. */
export interface VariableDef {
  name: string;
  value: number;
}

/** One owner of a workspace-wide variable name. */
export interface VariableDefiner {
  ownerType: EntityType;
  ownerId: string;
  value: number;
}

/** A variable name plus every object that defines it and every object that reads it. */
export interface GlobalVar {
  varName: string;
  definers: VariableDefiner[];
  /** Keys (`node:12` / `edge:edge_3`) of the objects that read this variable. */
  dependents: string[];
}

/** A variable read by an object that no connected object defines. */
export interface UnresolvedDep {
  type: EntityType;
  id: string;
  title: string;
  varName: string;
  /** True when the name exists elsewhere, but no edge connects the definer (legacy hint). */
  existsElsewhere?: boolean;
}

export interface StateEngine {
  /** `node:12` / `edge:edge_3` -> `{ varName: value }` defined by that object. */
  localDefs: Record<string, Record<string, number>>;
  globalList: GlobalVar[];
  unresolvedList: UnresolvedDep[];
  /** Edge id -> variable names exchanged between the edge's endpoints. */
  edgeFlow: Record<string, string[]>;
}

export interface WorkspaceRecalculation {
  /** `String(entity.id)` -> display text written to `mathValue`. */
  mathValues: Record<string, string>;
  state: StateEngine;
}

interface Entity {
  ref: NodeRecord | EdgeRecord;
  type: EntityType;
  id: string;
  key: string;
}

interface Neighbor {
  type: EntityType;
  id: string;
  viaEdgeId: string;
}

const EMPTY_STATE: StateEngine = { localDefs: {}, globalList: [], unresolvedList: [], edgeFlow: {} };

/** Stable key of one object inside the engine (legacy `keyOf`). */
export function keyOf(type: EntityType, id: string): string {
  return `${type}:${id}`;
}

/** Objects reachable from one object in a single hop; edges carry the hop they belong to. */
function getNeighbors(type: EntityType, id: string, edges: EdgeRecord[]): Neighbor[] {
  const out: Neighbor[] = [];
  if (type === 'node') {
    for (const edge of edges) {
      const viaEdgeId = String(edge.id);
      const sourceId = String(edge.sourceId);
      const targetId = String(edge.targetId);
      if (sourceId === id) {
        out.push({ type: 'node', id: targetId, viaEdgeId });
        out.push({ type: 'edge', id: viaEdgeId, viaEdgeId });
      } else if (targetId === id) {
        out.push({ type: 'node', id: sourceId, viaEdgeId });
        out.push({ type: 'edge', id: viaEdgeId, viaEdgeId });
      }
    }
  } else {
    const edge = edges.find((candidate) => String(candidate.id) === id);
    if (edge) {
      const viaEdgeId = String(edge.id);
      out.push({ type: 'node', id: String(edge.sourceId), viaEdgeId });
      out.push({ type: 'node', id: String(edge.targetId), viaEdgeId });
    }
  }
  return out;
}

function expressionOf(entity: NodeRecord | EdgeRecord): string {
  return (entity.mathExpression ?? '').trim();
}

/**
 * Evaluates every object in dependency order until the definitions stop
 * changing. Cycles simply stop after `entities.length + 1` passes, so a
 * mutually recursive chain can never hang the app.
 */
function computeWorkspace(nodes: NodeRecord[], edges: EdgeRecord[]): WorkspaceRecalculation {
  const entities: Entity[] = [];
  for (const node of nodes) {
    const id = String(node.id);
    entities.push({ ref: node, type: 'node', id, key: keyOf('node', id) });
  }
  for (const edge of edges) {
    const id = String(edge.id);
    entities.push({ ref: edge, type: 'edge', id, key: keyOf('edge', id) });
  }

  const parsedInfo: Record<string, FormulaSymbols> = {};
  const localDefs: Record<string, Record<string, number>> = {};
  const lastError: Record<string, unknown> = {};
  const lastDisplay: Record<string, string | null | undefined> = {};
  for (const entity of entities) {
    const expr = expressionOf(entity.ref);
    parsedInfo[entity.key] = expr ? extractFormulaSymbols(expr) : { defined: [], usedExternal: [] };
    localDefs[entity.key] = {};
  }

  const maxPasses = entities.length + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    let passChanged = false;
    for (const entity of entities) {
      const expr = expressionOf(entity.ref);
      if (!expr) {
        lastError[entity.key] = null;
        continue;
      }
      const scope: Record<string, number> = {};
      for (const neighbor of getNeighbors(entity.type, entity.id, edges)) {
        Object.assign(scope, localDefs[keyOf(neighbor.type, neighbor.id)]);
      }
      try {
        const result = math.evaluate(expr, scope);
        lastDisplay[entity.key] = formatMathResult(result);
        lastError[entity.key] = null;
        // mathjs writes assignments back into `scope`, so the expression's own
        // definitions are whatever its targets now hold there (legacy L7796).
        const own: Record<string, number> = {};
        for (const name of parsedInfo[entity.key].defined) {
          const value = scope[name];
          if (typeof value === 'number' && Number.isFinite(value)) own[name] = value;
        }
        const previous = localDefs[entity.key];
        const previousNames = Object.keys(previous);
        const ownNames = Object.keys(own);
        const sameOwn =
          previousNames.length === ownNames.length && ownNames.every((name) => previous[name] === own[name]);
        if (!sameOwn) passChanged = true;
        localDefs[entity.key] = own;
      } catch (error) {
        lastError[entity.key] = error;
      }
    }
    if (!passChanged) break;
  }

  const globalDefiners: Record<string, VariableDefiner[]> = {};
  for (const entity of entities) {
    const defs = localDefs[entity.key];
    for (const name of Object.keys(defs)) {
      const definers = (globalDefiners[name] ??= []);
      definers.push({ ownerType: entity.type, ownerId: entity.id, value: defs[name] });
    }
  }

  const dependentsByVar: Record<string, Set<string>> = {};
  const edgeFlowSets: Record<string, Set<string>> = {};
  const unresolvedList: UnresolvedDep[] = [];
  for (const entity of entities) {
    const neighbors = getNeighbors(entity.type, entity.id, edges);
    for (const name of parsedInfo[entity.key].usedExternal) {
      const found = neighbors.find((neighbor) => {
        const defs = localDefs[keyOf(neighbor.type, neighbor.id)];
        return defs !== undefined && Object.prototype.hasOwnProperty.call(defs, name);
      });
      if (!found) {
        unresolvedList.push({
          type: entity.type,
          id: entity.id,
          title: entity.ref.title,
          varName: name,
          existsElsewhere: (globalDefiners[name]?.length ?? 0) > 0,
        });
        continue;
      }
      (dependentsByVar[name] ??= new Set<string>()).add(entity.key);
      (edgeFlowSets[found.viaEdgeId] ??= new Set<string>()).add(name);
    }
  }

  const globalList: GlobalVar[] = Object.keys(globalDefiners)
    .sort()
    .map((varName) => ({
      varName,
      definers: globalDefiners[varName],
      dependents: [...(dependentsByVar[varName] ?? [])].sort(),
    }));

  const edgeFlow: Record<string, string[]> = {};
  for (const edgeId of Object.keys(edgeFlowSets).sort()) {
    edgeFlow[edgeId] = [...edgeFlowSets[edgeId]].sort();
  }

  const mathValues: Record<string, string> = {};
  for (const entity of entities) {
    if (!expressionOf(entity.ref)) continue;
    const error = lastError[entity.key];
    if (error) {
      mathValues[entity.id] = `Error: ${describeEvalError(error)}`;
      continue;
    }
    const display = lastDisplay[entity.key];
    mathValues[entity.id] = display ?? '(tanpa nilai tampilan; variabel berhasil didefinisikan)';
  }

  return { mathValues, state: { localDefs, globalList, unresolvedList, edgeFlow } };
}

/**
 * Recalculates the whole variable system. Never throws: an internal failure
 * degrades to an empty engine so rendering keeps working.
 */
export function recalculateWorkspace(nodes: NodeRecord[], edges: EdgeRecord[]): WorkspaceRecalculation {
  try {
    return computeWorkspace(nodes ?? [], edges ?? []);
  } catch (error) {
    console.error('Rekalkulasi variabel gagal:', error);
    return { mathValues: {}, state: EMPTY_STATE };
  }
}
