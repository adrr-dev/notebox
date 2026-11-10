import { RELATION_SYMBOLS } from '../features/graph/relationSymbols.data';

/**
 * Visual styling of a relation (legacy `getRelationStyle`, L12131).
 *
 * The legacy function only distinguished `isDashed`/arrow variants over a small
 * list of symbols. Here the colour family comes from the catalogue group in
 * `relationSymbols.data.ts`, so every symbol of the app gets a stable style.
 */
export interface RelationStyle {
  /** CSS hex colour, e.g. `#3b82f6`. */
  color: string;
  /** Indonesian label straight from the relation catalogue. */
  label: string;
  /** Negated / approximate variants are drawn dashed (legacy `isDashed`). */
  dashed: boolean;
}

/** Colour per catalogue group; symbols of one family share a hue. */
const GROUP_COLORS: Record<string, string> = {
  'Kesetaraan & Identitas': '#3b82f6',
  'Relasi Spasial & Geometri': '#06b6d4',
  'Perbandingan & Urutan': '#f59e0b',
  'Keanggotaan & Himpunan Bagian': '#8b5cf6',
  'Operasi Himpunan': '#8b5cf6',
  'Logika & Implikasi': '#f43f5e',
  'Kuantor Logika': '#f43f5e',
  Keterbagian: '#f59e0b',
  'Inferensi & Pembuktian': '#f43f5e',
};

/** Negated/doubtful symbols (legacy L12136-12141 dashed only `≈`). */
const DASHED_SYMBOLS: Record<string, true> = {
  '≠': true,
  '≈': true,
  '∉': true,
  '∦': true,
  '⊄': true,
  '⊅': true,
  '≮': true,
  '≯': true,
  '≰': true,
  '≱': true,
  '∤': true,
  '¬': true,
};

/** `none` (plain line) and unknown relations. */
const DEFAULT_COLOR = '#64748b';

const STYLE_BY_RELATION: Record<string, RelationStyle | undefined> = Object.fromEntries(
  RELATION_SYMBOLS.flatMap((group) =>
    group.options.map((option) => {
      const color = group.group ? (GROUP_COLORS[group.group] ?? DEFAULT_COLOR) : DEFAULT_COLOR;
      const style: RelationStyle = {
        color,
        label: option.label,
        dashed: DASHED_SYMBOLS[option.value] === true,
      };
      return [option.value, style] as const;
    }),
  ),
);

/** Resolves the style of a relation symbol; unknown/empty input yields the plain slate style. */
export function relationStyle(relation: string): RelationStyle {
  const style = Object.hasOwn(STYLE_BY_RELATION, relation) ? STYLE_BY_RELATION[relation] : undefined;
  return style ?? { color: DEFAULT_COLOR, label: relation, dashed: false };
}
