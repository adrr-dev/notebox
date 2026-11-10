/**
 * Formula evaluation helpers shared by the math evaluator modal, the state
 * engine (recalc.ts) and the graph3d mesh factory.
 *
 * Ported from the legacy single-file app:
 *  - `extractExprNames` / `formatMathResult` (legacy L7697-7733)
 *  - the mathjs fallback wrapper and its 5-significant-digit formatting
 *    (legacy L6289-6333, L7968+).
 *
 * Nothing in here is allowed to throw: callers render whatever comes back.
 */
import * as math from 'mathjs';
import type { EvalFunction, MathNode } from 'mathjs';

export type EvalResult = { ok: true; value: string } | { ok: false; error: string };

/** Symbols that behave like mathjs built-ins but are not exposed as keys of the
 * mathjs namespace, so `name in math` alone would treat them as user variables. */
const BUILTIN_SYMBOLS = new Set([
  'pi', 'e', 'i', 'tau', 'phi', 'Infinity', 'NaN', 'true', 'false', 'null', 'undefined', 'end',
]);

/** Assignment targets and free symbols of one expression (legacy `extractExprNames`). */
export interface FormulaSymbols {
  /** Names assigned by the expression (`x = 3` → `['x']`), in source order. */
  defined: string[];
  /** Names read by the expression that are neither defined here nor built-in. */
  usedExternal: string[];
}

/** Loosely typed view of a mathjs node: we only read structural flags. */
interface FormulaNode {
  isAssignmentNode?: boolean;
  isSymbolNode?: boolean;
  object?: FormulaNode;
  name?: string;
}

/**
 * Splits an expression into the variables it defines and the external variables
 * it depends on. A malformed expression yields no symbols instead of throwing.
 */
export function extractFormulaSymbols(expression: string): FormulaSymbols {
  const defined: string[] = [];
  const used: string[] = [];
  const expr = (expression ?? '').trim();
  if (!expr) return { defined, usedExternal: [] };
  try {
    math.parse(expr).traverse((rawNode: MathNode) => {
      // Structural view: the MathNode base type does not declare the
      // `isAssignmentNode` / `isSymbolNode` discriminators we read here.
      const node = rawNode as unknown as FormulaNode;
      // legacy L7700: only plain `name = ...` assignments count as definitions.
      if (node.isAssignmentNode && node.object?.isSymbolNode && node.object.name) {
        defined.push(node.object.name);
      } else if (node.isSymbolNode && node.name) {
        used.push(node.name);
      }
    });
  } catch {
    return { defined: [], usedExternal: [] };
  }
  const definedSet = new Set(defined);
  const usedExternal = [...new Set(used)].filter(
    (name) =>
      !definedSet.has(name) &&
      // mathjs functions/constants never count as user variables (legacy L7715).
      !BUILTIN_SYMBOLS.has(name) &&
      !Object.prototype.hasOwnProperty.call(math, name),
  );
  return { defined: [...definedSet], usedExternal };
}

/**
 * Names that look like user variables in an expression: every symbol that is
 * not a mathjs function/constant and not assigned by the expression itself.
 */
export function extractExpressionNames(expression: string): string[] {
  return extractFormulaSymbols(expression).usedExternal;
}

/** Formats a computed number with up to 5 significant digits, trailing zeros trimmed. */
export function formatMathNumber(value: number): string {
  try {
    return math.format(value, { precision: 5 });
  } catch {
    return String(value);
  }
}

/**
 * Display form of an arbitrary mathjs result (legacy `formatMathResult`):
 * a multi-statement ResultSet collapses to its last entry, and a result with
 * nothing to show yields null so callers can pick their own placeholder.
 */
export function formatMathResult(value: unknown): string | null {
  let result: unknown = value;
  if (result !== null && typeof result === 'object' && 'entries' in result) {
    const entries = result.entries;
    if (Array.isArray(entries)) {
      if (entries.length === 0) return null;
      result = entries[entries.length - 1];
    }
  }
  if (result === undefined || result === null) return null;
  try {
    return math.format(result, { precision: 5 });
  } catch {
    return String(result);
  }
}

/** Raw text of a thrown value (mathjs errors carry the annotation in `.message`). */
export function rawErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Friendly Indonesian message for a failed evaluation (legacy L7855): an
 * undefined symbol gets the "connect it with a line" hint, everything else is
 * prefixed as an invalid expression.
 */
export function describeEvalError(error: unknown): string {
  const message = rawErrorMessage(error);
  const undefinedSymbol = message.match(/Undefined symbol (\w+)/);
  if (undefinedSymbol) {
    return `${message} (variabel '${undefinedSymbol[1]}' belum tersedia — pastikan objek sumbernya sudah terhubung dengan garis)`;
  }
  return `Ekspresi tidak valid: ${message}`;
}

/**
 * Evaluates an expression with an optional variable scope. The scope is copied
 * first because mathjs mutates the object it receives for assignments.
 */
export function evaluateExpression(expression: string, scope: Record<string, number | string> = {}): EvalResult {
  const expr = (expression ?? '').trim();
  if (!expr) return { ok: false, error: 'Ekspresi kosong.' };
  try {
    const value = math.evaluate(expr, { ...scope });
    return { ok: true, value: formatMathResult(value) ?? '' };
  } catch (error) {
    return { ok: false, error: describeEvalError(error) };
  }
}

export type CompiledFormula =
  | { ok: true; fn: (scope: Record<string, number>) => number }
  | { ok: false; error: string };

/**
 * Compiles an expression into `f(scope) => number` for repeated evaluation,
 * used by the graph3d mesh factory. Compilation errors are reported up front;
 * evaluation failures yield NaN instead of throwing.
 */
export function compileFormula(expression: string): CompiledFormula {
  const expr = (expression ?? '').trim();
  if (!expr) return { ok: false, error: 'Ekspresi kosong.' };
  let compiled: EvalFunction;
  try {
    compiled = math.compile(expr);
  } catch (error) {
    return { ok: false, error: describeEvalError(error) };
  }
  return {
    ok: true,
    fn: (scope) => {
      try {
        const result: unknown = compiled.evaluate(scope);
        if (typeof result === 'number') return result;
        const coerced = Number(result);
        return Number.isFinite(coerced) ? coerced : NaN;
      } catch {
        return NaN;
      }
    },
  };
}
