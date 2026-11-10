import * as THREE from 'three';

/**
 * Canvas-drawn text sprites.
 *
 * The legacy app painted every label (text3d nodes, relation symbols, flow
 * chips) into an off-screen canvas and wrapped it in a `SpriteMaterial`
 * (legacy L11911-11922 for text3d, L12159-12178 for the relation symbol badge).
 * Here the painting lives in one place; textures are cached and shared between
 * sprites so repeated labels ("=", identical titles, …) cost one canvas.
 */

/** Options accepted by {@link createLabelSprite}. */
export interface LabelSpriteOptions {
  color?: string;
  background?: string;
  fontSize?: number;
  padding?: number;
  /** Wrap width in canvas pixels; `0`/omitted disables wrapping (legacy did not wrap). */
  maxWidth?: number;
  /** Copied to `sprite.userData.labelPriority` (legacy prevented overlapping labels). */
  priority?: number;
}

/** Options with every default resolved; stored on `sprite.userData.labelOptions`. */
export interface LabelSpriteResolvedOptions {
  color: string;
  background: string;
  fontSize: number;
  padding: number;
  maxWidth: number;
}

const DEFAULT_COLOR = '#f8fafc';
/** Legacy text3d painted the glyphs straight onto a transparent canvas (L12011). */
const DEFAULT_BACKGROUND = 'transparent';
/** Legacy `ctx.font = 'bold 80px Inter, sans-serif'` (L12013). */
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_PADDING = 12;
const DEFAULT_PRIORITY = 80;
const LINE_HEIGHT_FACTOR = 1.25;
/** Extra room around the glyphs so the emulated glow is not clipped. */
const GLOW_MARGIN_FACTOR = 0.14;
const GLOW_BLUR_FACTOR = 0.12;
const FONT_FAMILY = 'Inter, system-ui, sans-serif';

/**
 * World units per canvas pixel.
 *
 * A `fontSize: 80` label is 2 units tall, which reproduces the legacy text3d
 * sprite scale `sc * 4 x sc * 2` (legacy L11921) for a 2:1 label box.
 */
const WORLD_UNITS_PER_CANVAS_PIXEL = 1 / 50;

/** Supersampling factor: canvas is drawn at 2x and shown at its logical size. */
const RENDER_SCALE = 2;

interface CachedLabel {
  texture: THREE.CanvasTexture;
  /** Logical (CSS) canvas width in pixels. */
  width: number;
  /** Logical (CSS) canvas height in pixels. */
  height: number;
}

const labelCache = new Map<string, CachedLabel>();
let measureContext: CanvasRenderingContext2D | null = null;

function resolveOptions(opts: LabelSpriteOptions): LabelSpriteResolvedOptions {
  const fontSize =
    typeof opts.fontSize === 'number' && opts.fontSize > 0 ? opts.fontSize : DEFAULT_FONT_SIZE;
  return {
    color: opts.color ?? DEFAULT_COLOR,
    background: opts.background ?? DEFAULT_BACKGROUND,
    fontSize,
    padding: typeof opts.padding === 'number' && opts.padding >= 0 ? opts.padding : DEFAULT_PADDING,
    maxWidth: typeof opts.maxWidth === 'number' && opts.maxWidth > 0 ? opts.maxWidth : 0,
  };
}

/** Off-screen context used only to measure glyphs (never rendered). */
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

function fontString(fontSize: number): string {
  return `bold ${fontSize}px ${FONT_FAMILY}`;
}

/** Hard-breaks a single word that is wider than `maxWidth`. */
function breakWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const char of word) {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Greedy word wrap; explicit `\n` always starts a new line. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const words: string[] = [];
    for (const word of raw.split(/\s+/)) {
      if (!word) continue;
      if (ctx.measureText(word).width > maxWidth) words.push(...breakWord(ctx, word, maxWidth));
      else words.push(word);
    }
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
      else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paints (or reuses) the canvas texture for `text` + options. */
function renderLabel(text: string, opts: LabelSpriteResolvedOptions): CachedLabel {
  const key = `${text}\u0000${opts.color}|${opts.background}|${opts.fontSize}|${opts.padding}|${opts.maxWidth}`;
  const cached = labelCache.get(key);
  if (cached) return cached;

  const measure = getMeasureContext();
  const font = fontString(opts.fontSize);
  const glowMargin = Math.ceil(opts.fontSize * GLOW_MARGIN_FACTOR);
  const pad = opts.padding + glowMargin;
  const lineHeight = opts.fontSize * LINE_HEIGHT_FACTOR;

  let lines = text.split('\n');
  if (measure && opts.maxWidth > 0) {
    measure.font = font;
    lines = wrapLines(measure, text, opts.maxWidth);
  }

  let textWidth: number;
  if (measure) {
    measure.font = font;
    textWidth = 0;
    for (const line of lines) textWidth = Math.max(textWidth, measure.measureText(line).width);
  } else {
    // No 2D context (never happens in browsers): approximate with average glyph width.
    textWidth = opts.fontSize * 0.6 * Math.max(...lines.map((line) => line.length), 1);
  }

  const width = Math.max(1, Math.ceil(textWidth + pad * 2));
  const height = Math.max(1, Math.ceil(lines.length * lineHeight + pad * 2));

  const canvas = document.createElement('canvas');
  canvas.width = width * RENDER_SCALE;
  canvas.height = height * RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (opts.background !== 'transparent') {
      ctx.fillStyle = opts.background;
      roundRectPath(ctx, glowMargin, glowMargin, width - glowMargin * 2, height - glowMargin * 2, Math.min(12, opts.padding));
      ctx.fill();
    }
    // Emissive-looking text: legacy text3d used shadowColor/shadowBlur (L12014).
    ctx.shadowColor = opts.color;
    ctx.shadowBlur = opts.fontSize * GLOW_BLUR_FACTOR;
    ctx.fillStyle = opts.color;
    lines.forEach((line, index) => {
      ctx.fillText(line, width / 2, pad + lineHeight * (index + 0.5));
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Non-power-of-two canvas: mipmaps would need manual regeneration, so filter linearly.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Shared through the cache: `disposeObject3D` must not free it while another
  // sprite still shows the same label (see edgeMesh.disposeObject3D).
  texture.userData.sharedLabelTexture = true;

  const label: CachedLabel = { texture, width, height };
  labelCache.set(key, label);
  return label;
}

function applyLabelScale(sprite: THREE.Sprite, label: CachedLabel): void {
  sprite.scale.set(
    label.width * WORLD_UNITS_PER_CANVAS_PIXEL,
    label.height * WORLD_UNITS_PER_CANVAS_PIXEL,
    1,
  );
}

/**
 * Creates a text sprite backed by a cached canvas texture.
 *
 * `sprite.userData.labelPriority` mirrors the legacy anti-collision registry
 * (80 for relation labels, 90 for text3d nodes).
 */
export function createLabelSprite(text: string, opts: LabelSpriteOptions = {}): THREE.Sprite {
  const options = resolveOptions(opts);
  const label = renderLabel(text, options);
  const material = new THREE.SpriteMaterial({ map: label.texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.labelPriority = opts.priority ?? DEFAULT_PRIORITY;
  sprite.userData.labelText = text;
  sprite.userData.labelOptions = options;
  applyLabelScale(sprite, label);
  return sprite;
}

/**
 * Redraws the sprite for new text, reusing the options stored on the sprite
 * (`sprite.userData.labelOptions`, which callers may adjust for colour changes).
 */
export function setLabelSpriteText(sprite: THREE.Sprite, text: string): void {
  const material = sprite.material as THREE.SpriteMaterial;
  const stored = sprite.userData.labelOptions as LabelSpriteOptions | undefined;
  const options = resolveOptions(stored ?? {});
  const label = renderLabel(text, options);
  const previous = material.map;
  material.map = label.texture;
  material.needsUpdate = true;
  if (previous && previous.userData.sharedLabelTexture !== true) previous.dispose();
  sprite.userData.labelText = text;
  sprite.userData.labelOptions = options;
  applyLabelScale(sprite, label);
}
