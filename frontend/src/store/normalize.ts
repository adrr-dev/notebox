/**
 * Wire → app normalization.
 *
 * The backend omits zero/empty values, so records arriving from the server are
 * partial by design. Normalization materializes exactly the defaults the legacy
 * app applied when rendering, and nothing more: epistemic fields stay absent
 * until the user sets them.
 */
import type { Attachment, DescPage, DescStyle, EdgeRecord, NodeRecord, RevisionEntry } from '../types/model';

/** Default reading style of a description page (ported from the legacy editor). */
export const DEFAULT_DESC_STYLE: DescStyle = {
  fontFamily: 'inherit',
  fontSize: '',
  lineHeight: '',
  textAlign: 'left',
  maxWidth: '68ch',
  paragraphSpacing: '12',
  paragraphIndent: '0',
  padding: '0',
  useTextColor: false,
  textColor: '#e2e8f0',
  useBackgroundColor: false,
  backgroundColor: '#172554',
};

const STYLE_OPTIONS = {
  fontFamily: ['inherit', 'Inter, sans-serif', 'Arial, sans-serif', 'Georgia, serif', 'Courier New, monospace'],
  fontSize: ['', '12', '14', '16', '18', '20', '24'],
  lineHeight: ['', '1.35', '1.5', '1.65', '1.8', '2'],
  textAlign: ['left', 'justify', 'center', 'right'],
  maxWidth: ['48ch', '68ch', '80ch', '100%'],
  paragraphSpacing: ['0', '6', '12', '18', '24'],
  paragraphIndent: ['0', '1', '2'],
  padding: ['0', '8', '16', '24'],
} as const;

function pick(value: unknown, options: readonly string[], fallback: string): string {
  const text = String(value ?? '');
  return options.includes(text) ? text : fallback;
}

function isHexColor(value: unknown): boolean {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? ''));
}

/** Clamps a raw style object to the supported option sets. */
export function normalizeDescStyle(raw: unknown): DescStyle {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<DescStyle>;
  return {
    fontFamily: pick(source.fontFamily, STYLE_OPTIONS.fontFamily, DEFAULT_DESC_STYLE.fontFamily),
    fontSize: pick(source.fontSize, STYLE_OPTIONS.fontSize, DEFAULT_DESC_STYLE.fontSize),
    lineHeight: pick(source.lineHeight, STYLE_OPTIONS.lineHeight, DEFAULT_DESC_STYLE.lineHeight),
    textAlign: pick(source.textAlign, STYLE_OPTIONS.textAlign, DEFAULT_DESC_STYLE.textAlign) as DescStyle['textAlign'],
    maxWidth: pick(source.maxWidth, STYLE_OPTIONS.maxWidth, DEFAULT_DESC_STYLE.maxWidth),
    paragraphSpacing: pick(source.paragraphSpacing, STYLE_OPTIONS.paragraphSpacing, DEFAULT_DESC_STYLE.paragraphSpacing),
    paragraphIndent: pick(source.paragraphIndent, STYLE_OPTIONS.paragraphIndent, DEFAULT_DESC_STYLE.paragraphIndent),
    padding: pick(source.padding, STYLE_OPTIONS.padding, DEFAULT_DESC_STYLE.padding),
    useTextColor: source.useTextColor === true,
    textColor: isHexColor(source.textColor) ? String(source.textColor) : DEFAULT_DESC_STYLE.textColor,
    useBackgroundColor: source.useBackgroundColor === true,
    backgroundColor: isHexColor(source.backgroundColor)
      ? String(source.backgroundColor)
      : DEFAULT_DESC_STYLE.backgroundColor,
  };
}

function normalizePages(raw: unknown): DescPage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((page): page is Record<string, unknown> => !!page && typeof page === 'object')
    .map((page) => ({
      title: String(page.title ?? ''),
      desc: String(page.desc ?? ''),
      style: normalizeDescStyle(page.style),
    }));
}

function normalizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      name: String(item.name ?? ''),
      url: String(item.url ?? ''),
      type: item.type === undefined ? undefined : String(item.type),
      description: item.description === undefined ? undefined : String(item.description),
    }))
    .filter((item) => item.url !== '');
}

function normalizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((label) => String(label ?? '').trim()).filter(Boolean))];
}

function normalizeRevisions(raw: unknown): RevisionEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.filter((entry): entry is RevisionEntry => !!entry && typeof entry === 'object');
}

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/** Materializes node defaults; never invents epistemic metadata. */
export function normalizeNode(raw: NodeRecord): NodeRecord {
  return {
    ...raw,
    id: raw.id,
    title: String(raw.title ?? 'Tanpa Judul'),
    desc: String(raw.desc ?? ''),
    pageTitle: String(raw.pageTitle ?? ''),
    descStyle: normalizeDescStyle(raw.descStyle),
    pages: normalizePages(raw.pages),
    attachments: normalizeAttachments(raw.attachments),
    labels: normalizeLabels(raw.labels),
    profileIcon: raw.profileIcon ?? 'fa-cube',
    profileIconColor: raw.profileIconColor ?? '#60a5fa',
    profileIconBg: raw.profileIconBg ?? '#172554',
    shape: raw.shape ?? 'icosahedron',
    color: raw.color ?? '#3b82f6',
    scale: toNumber(raw.scale, 1),
    posX: toNumber(raw.posX, 0),
    posY: toNumber(raw.posY, 0),
    posZ: toNumber(raw.posZ, 0),
    isStatic: raw.isStatic === true,
    revisions: normalizeRevisions(raw.revisions),
  };
}

/** Materializes edge defaults. */
export function normalizeEdge(raw: EdgeRecord): EdgeRecord {
  return {
    ...raw,
    id: raw.id,
    sourceId: raw.sourceId,
    targetId: raw.targetId,
    relation: String(raw.relation ?? 'none'),
    title: String(raw.title ?? 'Koneksi Baru'),
    desc: String(raw.desc ?? ''),
    pageTitle: String(raw.pageTitle ?? ''),
    descStyle: normalizeDescStyle(raw.descStyle),
    pages: normalizePages(raw.pages),
    attachments: normalizeAttachments(raw.attachments),
    labels: normalizeLabels(raw.labels),
    profileIcon: raw.profileIcon ?? 'fa-diagram-project',
    profileIconColor: raw.profileIconColor ?? '#fb923c',
    profileIconBg: raw.profileIconBg ?? '#431407',
    revisions: normalizeRevisions(raw.revisions),
  };
}
