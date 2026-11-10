/**
 * Rich-text HTML sanitizing and plain-text extraction.
 *
 * Ported from the legacy single-file app (sanitizer L5998-6249,
 * richHTMLToText L6250-6257) reduced to what the object editor needs:
 * an allow-list of tags/attributes, `on*` handlers, `javascript:` and
 * `data:` URLs (except raster `data:image/…`; `data:image/svg+xml` is
 * deliberately blocked) and `<font>` normalized to `<span style>`.
 *
 * Raw HTML only ever enters an inert `<template>` at this boundary; every node
 * and attribute is then traversed against allow-lists before the returned
 * string reaches a live element.
 */

/** Inline image data URLs are capped at 8 Mi characters (legacy L6003). */
export const MAX_INLINE_IMAGE_CHARS = 8 * 1024 * 1024;
/** Inline audio/video data URLs are capped at 24 Mi characters (legacy L6004). */
export const MAX_INLINE_MEDIA_CHARS = 24 * 1024 * 1024;
/** Attachment data URLs share the 24 Mi character limit (legacy L6005). */
export const MAX_INLINE_ATTACHMENT_CHARS = 24 * 1024 * 1024;

const MAX_URL_CHARS = 16 * 1024;
const MAX_RICH_HREF_CHARS = 8 * 1024;
const MAX_RICH_STYLE_CHARS = 4 * 1024;

/** SVG is intentionally absent: it is an active document format. */
const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\r\n]+$/i;
const DATA_MEDIA_RE: Record<string, RegExp> = {
  audio: /^data:audio\/(?:mpeg|ogg|wav|webm|mp4|aac);base64,[a-z0-9+/=\r\n]+$/i,
  video: /^data:video\/(?:mp4|webm|ogg);base64,[a-z0-9+/=\r\n]+$/i,
};

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/** Tags the editor may keep; keys are uppercase tag names. */
const ALLOWED_TAGS: Record<string, true> = {
  A: true, B: true, STRONG: true, I: true, EM: true, U: true, S: true, DEL: true, INS: true, MARK: true,
  P: true, DIV: true, BR: true, HR: true, UL: true, OL: true, LI: true, BLOCKQUOTE: true, PRE: true,
  CODE: true, SPAN: true, SMALL: true, SUB: true, SUP: true, IMG: true, VIDEO: true, AUDIO: true, SOURCE: true,
  H1: true, H2: true, H3: true, H4: true, H5: true, H6: true, TABLE: true, CAPTION: true, THEAD: true,
  TBODY: true, TFOOT: true, TR: true, TH: true, TD: true,
  MATH: true, SEMANTICS: true, ANNOTATION: true, MROW: true, MI: true, MN: true, MO: true, MTEXT: true,
  MSPACE: true, MSUP: true, MSUB: true, MSUBSUP: true, MFRAC: true, MSQRT: true, MROOT: true,
  MUNDER: true, MOVER: true, MUNDEROVER: true, MENCLOSE: true, MPHANTOM: true, MSTYLE: true, MPADDED: true,
  MTABLE: true, MTR: true, MTD: true, MGROUP: true, MALIGNGROUP: true, MALIGNMARK: true,
};

/** Subtrees removed together with their contents. */
const DROP_WHOLE: Record<string, true> = {
  SCRIPT: true, STYLE: true, IFRAME: true, FRAME: true, FRAMESET: true, OBJECT: true, EMBED: true,
  SVG: true, FOREIGNOBJECT: true, FORM: true, INPUT: true, BUTTON: true, TEXTAREA: true, SELECT: true,
  OPTION: true, TRACK: true, LINK: true, META: true, BASE: true, NOSCRIPT: true,
};

/* Rich content from the clipboard or an import must never control global utility
   classes or the app's ARIA/role attributes (legacy L6049-6052). */
const GLOBAL_ATTRS: Record<string, true> = { title: true, dir: true, lang: true, style: true };
const MATH_ATTRS: Record<string, true> = {
  xmlns: true, display: true, mathvariant: true, stretchy: true, fence: true, separator: true, accent: true,
  largeop: true, lspace: true, rspace: true, voffset: true, notation: true, encoding: true, columnalign: true,
  rowalign: true, columnspacing: true, rowspacing: true, scriptlevel: true, displaystyle: true, mathsize: true,
  mathcolor: true, mathbackground: true, depth: true, width: true, height: true, align: true,
};

const STYLE_PROPS: Record<string, true> = {
  color: true, 'background-color': true, 'font-size': true, 'font-weight': true, 'font-style': true,
  'font-family': true, 'line-height': true, 'text-align': true, 'text-decoration': true, 'text-transform': true,
  'white-space': true, 'vertical-align': true, margin: true, 'margin-left': true, 'margin-right': true,
  'margin-top': true, 'margin-bottom': true, padding: true, 'padding-left': true, 'padding-right': true,
  'padding-top': true, 'padding-bottom': true, width: true, height: true, 'min-width': true, 'max-width': true,
  'min-height': true, 'max-height': true, display: true, border: true, 'border-color': true, 'border-style': true,
  'border-width': true, 'border-radius': true, 'list-style-type': true, opacity: true, overflow: true,
  'word-break': true, 'overflow-wrap': true,
};

/** Escapes the five HTML-significant characters for text insertion. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Filters a `style` attribute down to the safe declaration allow-list. */
export function safeRichStyle(styleText: unknown): string {
  if (String(styleText ?? '').length > MAX_RICH_STYLE_CHARS) return '';
  const kept: string[] = [];
  for (const decl of String(styleText ?? '').split(';')) {
    const index = decl.indexOf(':');
    if (index < 1) continue;
    const prop = decl.slice(0, index).trim().toLowerCase();
    const value = decl.slice(index + 1).trim();
    if (!Object.hasOwn(STYLE_PROPS, prop) || !value || /[<>\\]/.test(value)) continue;
    if (/url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding|var\s*\(/i.test(value)) continue;
    if (prop === 'display' && !/^(inline|inline-block|block|table|table-row|table-cell|list-item|flex|inline-flex|none)$/i.test(value)) continue;
    if (prop === 'opacity' && !/^(?:0|1|0?\.\d+)$/i.test(value)) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join('; ');
}

/** Allows http/https/mailto hrefs (legacy `safeRichHref`, plus `#` anchors). */
function safeRichHref(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_RICH_HREF_CHARS || CONTROL_CHARS_RE.test(raw)) return '';
  if (raw === '#' || /^#[a-zA-Z0-9_.:-]*$/.test(raw)) return raw;
  try {
    const url = new URL(raw, window.location.href);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return '';
    if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username || url.password)) return '';
    return raw;
  } catch {
    return '';
  }
}

/** Link URL accepted by the editor toolbar: http, https or mailto only. */
export function safeLinkUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048 || CONTROL_CHARS_RE.test(raw)) return '';
  try {
    const url = new URL(raw, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

/**
 * Rich-text images must not trigger unsolicited third-party network requests:
 * only embedded raster data or an in-session `blob:` URL survives.
 */
function safeRichImageSrc(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || CONTROL_CHARS_RE.test(raw)) return '';
  if (raw.startsWith('data:')) {
    return raw.length <= MAX_INLINE_IMAGE_CHARS && DATA_IMAGE_RE.test(raw) ? raw : '';
  }
  if (raw.length > MAX_URL_CHARS) return '';
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'blob:') return raw;
  } catch {
    /* not a URL */
  }
  return '';
}

function safeRichMediaSrc(value: unknown, mediaType: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || CONTROL_CHARS_RE.test(raw)) return '';
  if (raw.startsWith('data:')) {
    const rule = DATA_MEDIA_RE[mediaType];
    return raw.length <= MAX_INLINE_MEDIA_CHARS && rule && rule.test(raw) ? raw : '';
  }
  if (raw.length > MAX_URL_CHARS) return '';
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'blob:') return raw;
  } catch {
    /* not a URL */
  }
  return '';
}

/** Legacy `execCommand('fontName'|'fontSize')` emits `<font>`: normalize it. */
function normalizeFontElement(font: Element): void {
  const span = document.createElement('span');
  const css: string[] = [];
  const face = String(font.getAttribute('face') ?? '').trim();
  if (face && face.length <= 100 && !/[<>\\;]/.test(face)) css.push(`font-family: ${face}`);
  const sizeMap: Record<string, string> = { '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '40px' };
  const fontSize = sizeMap[String(font.getAttribute('size') ?? '').trim()];
  if (fontSize) css.push(`font-size: ${fontSize}`);
  const fontColor = String(font.getAttribute('color') ?? '').trim();
  if (/^(#[0-9a-f]{3,8}|[a-z]{1,20}|rgb\(\s*[0-9.%\s,]+\)|hsl\(\s*[0-9.%\s,]+\))$/i.test(fontColor)) css.push(`color: ${fontColor}`);
  const safe = safeRichStyle(css.join('; '));
  if (safe) span.setAttribute('style', safe);
  while (font.firstChild) span.appendChild(font.firstChild);
  font.replaceWith(span);
  cleanChildren(span);
}

function cleanChildren(parent: Element): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }
    const element = child as Element;
    const tag = element.tagName.toUpperCase();
    if (Object.hasOwn(DROP_WHOLE, tag)) {
      element.remove();
      continue;
    }
    if (tag === 'FONT') {
      normalizeFontElement(element);
      continue;
    }
    /* <source> is meaningful only as a direct child of an allowed audio/video element. */
    if (tag === 'SOURCE' && !parent.tagName.match(/^(VIDEO|AUDIO)$/i)) {
      element.remove();
      continue;
    }
    if (!Object.hasOwn(ALLOWED_TAGS, tag)) {
      cleanChildren(element);
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      let keep = Object.hasOwn(GLOBAL_ATTRS, name);
      if (name === 'style') {
        const safe = safeRichStyle(attr.value);
        if (safe) element.setAttribute('style', safe);
        else element.removeAttribute('style');
        continue;
      }
      if (tag === 'A' && name === 'href') {
        const safe = safeRichHref(attr.value);
        if (safe) element.setAttribute('href', safe);
        else element.removeAttribute('href');
        continue;
      }
      if (tag === 'A' && name === 'target') {
        const target = String(attr.value || '').trim().toLowerCase();
        if (target === '_blank' || target === '_self') element.setAttribute('target', target);
        else element.removeAttribute('target');
        continue;
      }
      /* rel comes entirely from the policy below, never from the import. */
      if (tag === 'A' && name === 'rel') {
        element.removeAttribute('rel');
        continue;
      }
      if (['IMG', 'VIDEO', 'AUDIO'].includes(tag) && (name === 'width' || name === 'height')) {
        const rawSize = String(attr.value || '').trim();
        const px = /^\d{1,4}$/.test(rawSize) ? Number(rawSize) : 0;
        if (px > 0 && px <= 4096) element.setAttribute(name, String(px));
        else element.removeAttribute(name);
        continue;
      }
      if (tag === 'IMG' && name === 'src') {
        const safe = safeRichImageSrc(attr.value);
        if (safe) element.setAttribute('src', safe);
        else element.removeAttribute('src');
        continue;
      }
      if ((tag === 'VIDEO' || tag === 'AUDIO') && name === 'src') {
        const safe = safeRichMediaSrc(attr.value, tag.toLowerCase());
        if (safe) element.setAttribute('src', safe);
        else element.removeAttribute('src');
        continue;
      }
      if (tag === 'SOURCE' && name === 'src') {
        const mediaTag = element.parentElement?.tagName?.toLowerCase() ?? '';
        const safe = safeRichMediaSrc(attr.value, mediaTag);
        if (safe) element.setAttribute('src', safe);
        else element.removeAttribute('src');
        continue;
      }
      if (tag === 'VIDEO' && name === 'poster') {
        const safe = safeRichImageSrc(attr.value);
        if (safe) element.setAttribute('poster', safe);
        else element.removeAttribute('poster');
        continue;
      }
      if (['VIDEO', 'AUDIO'].includes(tag) && ['controls', 'loop', 'muted', 'playsinline'].includes(name)) {
        element.setAttribute(name, '');
        continue;
      }
      if (['VIDEO', 'AUDIO'].includes(tag) && name === 'preload') {
        const preload = String(attr.value || '').toLowerCase();
        element.setAttribute('preload', preload === 'none' || preload === 'metadata' ? preload : 'metadata');
        continue;
      }
      if (tag === 'SOURCE' && name === 'type') {
        const type = String(attr.value || '').trim().toLowerCase();
        if (/^(audio\/(mpeg|ogg|wav|webm|mp4|aac)|video\/(mp4|webm|ogg))$/.test(type)) element.setAttribute('type', type);
        else element.removeAttribute('type');
        continue;
      }
      if (tag === 'IMG' && name === 'alt') keep = true;
      if ((tag === 'TD' || tag === 'TH') && ['colspan', 'rowspan', 'scope'].includes(name)) keep = true;
      if ((tag === 'OL' || tag === 'LI') && ['start', 'value'].includes(name)) keep = true;
      if (tag === 'IMG' && name === 'referrerpolicy') keep = true;
      /* Every data-* attribute from imported rich HTML is dropped. */
      if (tag.startsWith('M') && Object.hasOwn(MATH_ATTRS, name)) keep = true;
      if (!keep || /^on/i.test(name) || name === 'srcset' || name === 'xlink:href') element.removeAttribute(attr.name);
    }
    if (tag === 'A' && element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener noreferrer');
    if (tag === 'IMG') {
      if (!element.getAttribute('src')) {
        element.replaceWith(document.createTextNode(element.getAttribute('alt') || ''));
        continue;
      }
      element.setAttribute('referrerpolicy', 'no-referrer');
      element.setAttribute('loading', 'lazy');
    }
    cleanChildren(element);
    if (tag === 'SOURCE' && !element.getAttribute('src')) {
      element.remove();
      continue;
    }
    if (tag === 'VIDEO' || tag === 'AUDIO') {
      const hasSource = !!element.getAttribute('src') || !!element.querySelector('source[src]');
      if (!hasSource) {
        element.remove();
        continue;
      }
      /* Media must require deliberate playback; remote/autoplay attributes are never retained. */
      element.removeAttribute('autoplay');
      element.setAttribute('controls', '');
      if (!element.hasAttribute('preload')) element.setAttribute('preload', 'metadata');
    }
  }
}

/** Returns an allow-listed HTML fragment; unsafe nodes/attributes are dropped. */
export function sanitizeRichHTML(input: unknown): string {
  // A detached <div> acts as the parse context; inserted scripts never execute
  // and every dangerous node/attribute is stripped below.
  const holder = document.createElement('div');
  holder.innerHTML = String(input ?? '');
  cleanChildren(holder);
  return holder.innerHTML;
}

/** Flattens sanitized rich HTML to plain text (legacy L6250-6257). */
export function richHTMLToText(input: unknown): string {
  const normalized = sanitizeRichHTML(input)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|blockquote|tr)>/gi, '\n');
  const template = document.createElement('template');
  template.innerHTML = normalized;
  return String(template.content.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
