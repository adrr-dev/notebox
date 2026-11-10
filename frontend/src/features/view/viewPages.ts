/**
 * Read-view page helpers, ported from the legacy single-file app.
 *
 * legacy L8930 `viewPagesOf`, L6359 `highlightHTML`, L6103 `sanitizeRichHTML`,
 * L6158 `richHTMLToText`. The sanitizer here is deliberately smaller than the
 * legacy one: the import pipeline already normalizes rich text, so the read
 * surfaces only need a minimal, safe allow-list to render untrusted HTML.
 */
import type { DescPage, DescStyle, EdgeRecord, NodeRecord } from '../../types/model';
import { profileDefaults, type ProfileVisual } from '../editor/ProfileIconPicker';

/** One rendered page of an object: page 1 plus every extra `pages[]` entry. */
export interface ViewPage {
  title: string;
  desc: string;
  style?: DescStyle;
}

/** Page 1 (`pageTitle`/`desc`/`descStyle`) followed by every extra page. legacy L8930 */
export function viewPagesOf(record: NodeRecord | EdgeRecord): ViewPage[] {
  const first: ViewPage = {
    title: record.pageTitle || '',
    desc: record.desc || '',
    style: record.descStyle,
  };
  const pages: DescPage[] = Array.isArray(record.pages) ? record.pages : [];
  if (pages.length === 0) return [first];
  return [
    first,
    ...pages.map((page) => ({ title: page.title || '', desc: page.desc || '', style: page.style })),
  ];
}

/**
 * Identity fields of a record, falling back to the shared per-type defaults.
 * The display component itself is `ProfileAvatar` in the editor feature.
 */
export function identityOf(record: NodeRecord | EdgeRecord, type: 'node' | 'edge'): ProfileVisual {
  const defaults = profileDefaults(type);
  return {
    profileIcon: record.profileIcon ?? defaults.profileIcon,
    profileGlyph: record.profileGlyph ?? '',
    profileImage: record.profileImage ?? '',
    profileIconColor: record.profileIconColor ?? defaults.profileIconColor,
    profileIconBg: record.profileIconBg ?? defaults.profileIconBg,
  };
}

/** Tags removed together with their subtree. */
const DROPPED_TAGS: Record<string, true> = {
  SCRIPT: true,
  STYLE: true,
  IFRAME: true,
  FRAME: true,
  FRAMESET: true,
  OBJECT: true,
  EMBED: true,
  FORM: true,
  INPUT: true,
  BUTTON: true,
  TEXTAREA: true,
  SELECT: true,
  OPTION: true,
  LINK: true,
  META: true,
  BASE: true,
  SVG: true,
  MATH: true,
  NOSCRIPT: true,
};

/** Tags preserved by the sanitizer. */
const ALLOWED_TAGS: Record<string, true> = {
  A: true,
  P: true,
  DIV: true,
  SPAN: true,
  BR: true,
  HR: true,
  STRONG: true,
  B: true,
  EM: true,
  I: true,
  U: true,
  S: true,
  DEL: true,
  INS: true,
  MARK: true,
  SMALL: true,
  SUB: true,
  SUP: true,
  UL: true,
  OL: true,
  LI: true,
  BLOCKQUOTE: true,
  PRE: true,
  CODE: true,
  H1: true,
  H2: true,
  H3: true,
  H4: true,
  H5: true,
  H6: true,
  TABLE: true,
  THEAD: true,
  TBODY: true,
  TFOOT: true,
  TR: true,
  TH: true,
  TD: true,
  IMG: true,
};

/** Allows anchors to http(s)/mailto/fragments; everything else is dropped. */
function safeHref(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return '';
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return value;
  }
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

/** Images may embed raster data URLs or load over http(s). */
function safeImageSrc(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

function sanitizeChildren(parent: Node): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1) {
      child.remove();
      continue;
    }
    const element = child as HTMLElement;
    const tag = element.tagName.toUpperCase();
    if (Object.hasOwn(DROPPED_TAGS, tag)) {
      element.remove();
      continue;
    }
    if (!Object.hasOwn(ALLOWED_TAGS, tag)) {
      // Unknown-but-harmless wrappers are unwrapped so their text survives.
      sanitizeChildren(element);
      const fragment = document.createDocumentFragment();
      while (element.firstChild) fragment.appendChild(element.firstChild);
      element.replaceWith(fragment);
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (tag === 'A' && name === 'href') {
        const href = safeHref(attribute.value);
        if (href) element.setAttribute('href', href);
        else element.removeAttribute('href');
        continue;
      }
      if (tag === 'IMG' && name === 'src') {
        const src = safeImageSrc(attribute.value);
        if (src) element.setAttribute('src', src);
        else element.removeAttribute('src');
        continue;
      }
      const keep =
        (tag === 'IMG' && name === 'alt') ||
        ((tag === 'TD' || tag === 'TH') && (name === 'colspan' || name === 'rowspan'));
      if (!keep) element.removeAttribute(attribute.name);
    }
    if (tag === 'IMG' && !element.getAttribute('src')) {
      element.remove();
      continue;
    }
    sanitizeChildren(element);
  }
}

/** Minimal allow-list sanitizer for rich description HTML. */
export function sanitizeRichHTML(input: string): string {
  const template = document.createElement('template');
  template.innerHTML = String(input ?? '');
  sanitizeChildren(template.content);
  return template.innerHTML;
}

/** Plain text of a rich fragment (block ends become newlines), legacy L6158. */
export function plainText(html: string): string {
  const normalized = sanitizeRichHTML(String(html ?? ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|blockquote|tr)>/gi, '\n');
  const template = document.createElement('template');
  template.innerHTML = normalized;
  return String(template.content.textContent ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escapes HTML entities; used before wrapping search matches. legacy L5987 */
export function escapeHtml(value: unknown): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch]);
}

/**
 * Escapes the input, then wraps case-insensitive matches in
 * `<mark class="ri3d-holo">`. Callers inject the result with
 * `dangerouslySetInnerHTML`. legacy L6359
 */
export function highlightHtml(html: string, query: string): string {
  const safe = escapeHtml(html);
  const needle = String(query ?? '').trim();
  if (!needle) return safe;
  const pattern = new RegExp(escapeRegExp(needle), 'gi');
  return safe.replace(pattern, (match) => `<mark class="ri3d-holo">${match}</mark>`);
}
