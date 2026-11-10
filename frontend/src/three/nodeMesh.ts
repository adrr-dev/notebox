import * as THREE from 'three';
import { compile, type EvalFunction } from 'mathjs';
import type { NodeRecord, NodeShape } from '../types/model';
import { createLabelSprite, setLabelSpriteText, type LabelSpriteOptions } from './labelSprite';
import { disposeObject3D } from './edgeMesh';

/**
 * Geometry factories for graph nodes (legacy `createNodeMesh`, L11904-12081).
 *
 * Every node becomes a `THREE.Group` whose children are recycled by
 * {@link applyNodeAppearance}; only a shape change rebuilds the geometry
 * ({@link refreshNodeMesh}). The legacy version created the mesh inline for
 * every render, which leaked geometry on every node edit.
 */

const BODY_NAME = 'nodeBody';
const TEXT_SPRITE_NAME = 'textLabel';
const IMAGE_SPRITE_NAME = 'imageLabel';
const IMAGE_PLACEHOLDER_NAME = 'imagePlaceholder';
const CONTAINER_SHELL_NAME = 'containerShell';
const CONTAINER_HANDLE_NAME = 'containerHandle';
const DROP_LINE_NAME = 'dropLine';
const DROP_RING_NAME = 'dropRing';
const GRAPH_ERROR_NAME = 'graphError';

/** Legacy `confDropLine` (L6417). */
const DROP_LINE_COLOR = 0x3b82f6;
const DROP_LINE_OPACITY = 0.7;
/** Hide a guide line once the node is within this distance of its zero plane. */
const DROP_LINE_EPSILON = 0.1;
const DEFAULT_NODE_COLOR = '#93c5fd';
const FALLBACK_SHAPE: NodeShape = 'icosahedron';
/** Legacy `bold 80px` text3d canvas (L12013). */
const TEXT_FONT_SIZE = 80;
/** Legacy text3d canvas (L12013); long titles wrap instead of overrunning the sprite. */
const TEXT_MAX_WIDTH = 1024;

type DropAxis = 'X' | 'Y' | 'Z';

/** Unknown/missing shapes fall back to `icosahedron` (legacy `else` branch, L12047). */
function resolveShape(shape: NodeShape | undefined): NodeShape {
  switch (shape) {
    case 'cube':
    case 'sphere':
    case 'cylinder':
    case 'icosahedron':
    case 'text3d':
    case 'custom_image':
    case 'graph3d':
    case 'container':
      return shape;
    default:
      return FALLBACK_SHAPE;
  }
}

function loadImageTexture(src: string, onLoaded?: (texture: THREE.Texture) => void): THREE.Texture {
  const texture = new THREE.TextureLoader().load(src, onLoaded);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextSprite(node: NodeRecord, color: string): THREE.Object3D {
  const options: LabelSpriteOptions = {
    color,
    background: 'transparent',
    fontSize: TEXT_FONT_SIZE,
    padding: 8,
    maxWidth: TEXT_MAX_WIDTH,
    priority: 90, // Text nodes win label collisions (legacy registry).
  };
  const sprite = createLabelSprite(node.textContent || node.title || 'TEKS', options); // Legacy fallback L12017.
  sprite.name = TEXT_SPRITE_NAME;
  return sprite;
}

/** Fits the sprite to the loaded bitmap, keeping its largest side at 3 units (legacy L11930). */
function applyImageSpriteScale(sprite: THREE.Sprite, texture: THREE.Texture): void {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;
  const aspect = width / Math.max(height, 1);
  const size = 3;
  sprite.scale.set(aspect >= 1 ? size : size * aspect, aspect >= 1 ? size / aspect : size, 1);
}

function createImageSprite(node: NodeRecord): THREE.Object3D {
  const src = node.imageBase64 || node.textureUrl;
  if (!src) return createImagePlaceholder();
  const material = new THREE.SpriteMaterial({ transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.name = IMAGE_SPRITE_NAME;
  sprite.userData.imageSrc = src;
  sprite.scale.set(3, 3, 1);
  material.map = loadImageTexture(src, (texture) => applyImageSpriteScale(sprite, texture));
  return sprite;
}

/** Shown when a `custom_image` node has neither `imageBase64` nor `textureUrl`. */
function createImagePlaceholder(): THREE.Object3D {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, wireframe: true }),
  );
  mesh.name = IMAGE_PLACEHOLDER_NAME;
  return mesh;
}

function buildSolidShape(group: THREE.Group, shape: NodeShape, color: string): void {
  // Legacy dimensions (L12046-12049).
  const geometry =
    shape === 'sphere'
      ? new THREE.SphereGeometry(1.5, 32, 32)
      : shape === 'cylinder'
        ? new THREE.CylinderGeometry(1, 1, 3, 32)
        : shape === 'icosahedron'
          ? new THREE.IcosahedronGeometry(1.5)
          : new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.7 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = BODY_NAME;
  // White edge overlay (legacy L12056).
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }),
    ),
  );
  group.add(mesh);
}

function buildContainer(group: THREE.Group, node: NodeRecord, color: string): void {
  group.userData.isContainer = true;
  const size: [number, number, number] = node.ctn?.size ?? [4, 3, 4];
  const opacity = node.ctn?.opacity ?? 0.12;
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const shell = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.6,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shell.name = CONTAINER_SHELL_NAME;
  shell.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    ),
  );
  group.add(shell);

  const handle = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }),
  );
  handle.name = CONTAINER_HANDLE_NAME;
  handle.position.set(0, size[1] / 2 + 0.6, 0);
  group.add(handle);
}

/** Legacy `cleanFormula` (L11832): drop a leading `y =` / `z =`. */
function cleanFormula(raw: string | undefined): string {
  const formula = (raw ?? '').trim();
  return formula.includes('=') ? (formula.split('=').pop() ?? '').trim() : formula;
}

/** Legacy validated ranges inline (L11940): invalid or empty range means -5..5. */
function normalizeRange(min: number | undefined, max: number | undefined): [number, number] {
  const lo = typeof min === 'number' && Number.isFinite(min) ? min : -5;
  const hi = typeof max === 'number' && Number.isFinite(max) ? max : 5;
  return hi > lo ? [lo, hi] : [-5, 5];
}

function evaluateNumber(compiled: EvalFunction, scope: Record<string, number>): number {
  try {
    const value: unknown = compiled.evaluate(scope);
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  } catch {
    // Legacy swallowed evaluation errors per sample point (L11955).
    return 0;
  }
}

function buildGraphSurface(group: THREE.Group, compiled: EvalFunction, xMin: number, xMax: number, yMin: number, yMax: number, color: string): void {
  const segments = 30; // Legacy L11948.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= segments; j++) {
    const fy = yMin + (yMax - yMin) * (j / segments);
    for (let i = 0; i <= segments; i++) {
      const fx = xMin + (xMax - xMin) * (i / segments);
      const fz = evaluateNumber(compiled, { x: fx, y: fy });
      positions.push(fx, fz, fy);
      uvs.push(i / segments, j / segments);
    }
  }
  const cols = segments + 1;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        roughness: 0.45,
        metalness: 0.1,
      }),
    ),
  );
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.18 }),
    ),
  );
}

function buildGraphCurve(group: THREE.Group, compiled: EvalFunction, xMin: number, xMax: number, color: string): void {
  const steps = 100; // Legacy L11986.
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const fx = xMin + (xMax - xMin) * (i / steps);
    points.push(new THREE.Vector3(fx, evaluateNumber(compiled, { x: fx }), 0));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const radius = Math.max((xMax - xMin) / 200, 0.035);
  const geometry = new THREE.TubeGeometry(curve, 120, radius, 8, false);
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 })));
}

/** Formula that cannot be compiled: a small red wireframe box, never a throw. */
function buildGraphError(group: THREE.Group): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xef4444, wireframe: true }),
  );
  mesh.name = GRAPH_ERROR_NAME;
  group.add(mesh);
}

function buildGraph3D(group: THREE.Group, node: NodeRecord, color: string): void {
  const [xMin, xMax] = normalizeRange(node.graphXMin, node.graphXMax);
  const [yMin, yMax] = normalizeRange(node.graphYMin, node.graphYMax);
  const formula = cleanFormula(node.graphFormula) || 'x';

  let compiled: EvalFunction | null = null;
  try {
    compiled = compile(formula || '0');
  } catch {
    compiled = null;
  }

  if (!compiled) {
    buildGraphError(group);
  } else if (node.graphType === 'surface') {
    buildGraphSurface(group, compiled, xMin, xMax, yMin, yMax, color);
  } else {
    buildGraphCurve(group, compiled, xMin, xMax, color);
  }

  const axisSize = Math.max(xMax - xMin, yMax - yMin, 4) / 2 + 0.8; // Legacy L12078.
  group.add(new THREE.AxesHelper(axisSize));
}

/** Two-point dashed line plus its ground ring, one per world axis. */
function createDropLine(axis: DropAxis): { line: THREE.Line; ring: THREE.Mesh } {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineDashedMaterial({
      color: DROP_LINE_COLOR,
      dashSize: 0.3,
      gapSize: 0.15,
      transparent: true,
      opacity: DROP_LINE_OPACITY,
    }),
  );
  line.name = DROP_LINE_NAME;
  line.userData.axis = axis;
  line.frustumCulled = false;
  line.computeLineDistances();

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.3, 16),
    new THREE.MeshBasicMaterial({
      color: DROP_LINE_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: DROP_LINE_OPACITY * 0.85,
    }),
  );
  ring.name = DROP_RING_NAME;
  ring.userData.axis = axis;
  if (axis === 'Y') ring.rotateX(-Math.PI / 2); // Legacy L12072-12075.
  else if (axis === 'X') ring.rotateY(Math.PI / 2);
  ring.userData.baseQuat = ring.quaternion.clone();

  // Guides must never intercept clicks (legacy lines were excluded from picking).
  line.raycast = () => {};
  ring.raycast = () => {};
  return { line, ring };
}

function addDropLines(group: THREE.Group): void {
  for (const axis of ['Y', 'X', 'Z'] as const) {
    const { line, ring } = createDropLine(axis);
    group.add(line, ring);
  }
  group.userData.dropLinesVisible = true;
}

function findDropChild(group: THREE.Object3D, name: string, axis: DropAxis): THREE.Object3D | undefined {
  return group.children.find((child) => child.name === name && child.userData.axis === axis);
}

/**
 * Creates the mesh group of a node, positioned at the origin.
 * The record's appearance (colour, scale) is applied here; the caller places
 * the group with {@link applyNodePosition} (the engine also moves it while
 * dragging).
 */
export function createNodeMesh(node: NodeRecord): THREE.Object3D {
  const shape = resolveShape(node.shape);
  const group = new THREE.Group();
  group.userData = { kind: 'node', id: node.id, shape, dropLinesVisible: true };
  const color = node.color ?? DEFAULT_NODE_COLOR;

  switch (shape) {
    case 'text3d':
      group.add(createTextSprite(node, color));
      break;
    case 'custom_image':
      group.add(createImageSprite(node));
      break;
    case 'graph3d':
      buildGraph3D(group, node, color);
      break;
    case 'container':
      buildContainer(group, node, color);
      break;
    default:
      buildSolidShape(group, shape, color);
      break;
  }

  // Containers (Fase 2) never had projection guides in the legacy app (L11905).
  if (shape !== 'container') addDropLines(group);
  applyNodeAppearance(group, node);
  // Groups are created at the origin: this hides the zero-length guides until
  // the engine (or applyNodePosition) moves the node.
  updateDropLines(group);
  return group;
}

/** Keeps a `custom_image` sprite in sync with the record, swapping the placeholder. */
function syncImageSprite(group: THREE.Object3D, node: NodeRecord): void {
  const src = node.imageBase64 || node.textureUrl;
  const current = group.getObjectByName(IMAGE_SPRITE_NAME) as THREE.Sprite | undefined;
  if (src) {
    if (!current) {
      const placeholder = group.getObjectByName(IMAGE_PLACEHOLDER_NAME);
      if (placeholder) {
        group.remove(placeholder);
        disposeObject3D(placeholder);
      }
      group.add(createImageSprite(node));
      return;
    }
    if (current.userData.imageSrc !== src) {
      const material = current.material as THREE.SpriteMaterial;
      const previous = material.map;
      material.map = loadImageTexture(src, (texture) => applyImageSpriteScale(current, texture));
      material.needsUpdate = true;
      if (previous) previous.dispose();
      current.userData.imageSrc = src;
    }
    return;
  }
  if (current) {
    group.remove(current);
    disposeObject3D(current);
    group.add(createImagePlaceholder());
  }
}

/**
 * Applies record values to an existing mesh without rebuilding geometry:
 * group scale, material colour, container opacity, sprite/placeholder state.
 */
export function applyNodeAppearance(group: THREE.Object3D, node: NodeRecord): void {
  const scale = typeof node.scale === 'number' && node.scale > 0 ? node.scale : 1;
  group.scale.setScalar(scale);
  const color = node.color ?? DEFAULT_NODE_COLOR;

  const body = group.getObjectByName(BODY_NAME) as THREE.Mesh | undefined;
  if (body && body.material instanceof THREE.MeshStandardMaterial) body.material.color.set(color);

  const shell = group.getObjectByName(CONTAINER_SHELL_NAME) as THREE.Mesh | undefined;
  if (shell && shell.material instanceof THREE.MeshStandardMaterial) {
    shell.material.color.set(color);
    shell.material.opacity = node.ctn?.opacity ?? 0.12;
  }
  const handle = group.getObjectByName(CONTAINER_HANDLE_NAME) as THREE.Mesh | undefined;
  if (handle && handle.material instanceof THREE.MeshStandardMaterial) {
    handle.material.color.set(color);
    handle.material.emissive.set(color);
  }

  const textSprite = group.getObjectByName(TEXT_SPRITE_NAME) as THREE.Sprite | undefined;
  if (textSprite) {
    const text = node.textContent || node.title || 'TEKS'; // Legacy fallback L12017.
    const options = (textSprite.userData.labelOptions as LabelSpriteOptions | undefined) ?? {};
    if (textSprite.userData.labelText !== text || options.color !== color) {
      textSprite.userData.labelOptions = { ...options, color };
      setLabelSpriteText(textSprite, text);
    }
  }

  if (group.userData.shape === 'custom_image') syncImageSprite(group, node);
}

/**
 * Rebuilds only when the shape changed (the shape is kept in
 * `group.userData.shape`, resolved through the icosahedron fallback).
 * Returns the replacement mesh, or `null` when the existing group was updated.
 */
export function refreshNodeMesh(group: THREE.Object3D, node: NodeRecord): THREE.Object3D | null {
  if (group.userData.shape === resolveShape(node.shape)) {
    applyNodeAppearance(group, node);
    updateDropLines(group);
    return null;
  }
  const replacement = createNodeMesh(node);
  // Keep the live transform (mid-drag) but take scale/colour from the record.
  replacement.position.copy(group.position);
  replacement.quaternion.copy(group.quaternion);
  replacement.visible = group.visible;
  applyNodeAppearance(replacement, node);
  updateDropLines(replacement);
  return replacement;
}

/** Initial placement helper; the engine keeps setting positions during drags. */
export function applyNodePosition(group: THREE.Object3D, node: NodeRecord): void {
  group.position.set(node.posX ?? 0, node.posY ?? 0, node.posZ ?? 0);
  updateDropLines(group);
}

/** Toggles the projection guides without touching the node geometry. */
export function setDropLinesVisible(group: THREE.Object3D, visible: boolean): void {
  group.userData.dropLinesVisible = visible;
  if (visible) {
    updateDropLines(group);
    return;
  }
  for (const child of group.children) {
    if (child.name === DROP_LINE_NAME || child.name === DROP_RING_NAME) child.visible = false;
  }
}

/**
 * Redraws the guide lines from the node down to the XZ ground plane and to the
 * X/Y/Z zero planes (legacy `updateDropLines`, L12091).
 */
export function updateDropLines(group: THREE.Object3D): void {
  const enabled = group.userData.dropLinesVisible !== false;
  const position = group.position;
  const inverseQuaternion = group.quaternion.clone().invert();
  // Guides are children of the group, which carries node.scale; undo it so the
  // lines keep their world-space length (legacy kept the scale on the inner mesh).
  const inverseScale = group.scale.x !== 0 ? 1 / group.scale.x : 1;

  const projections: Array<{ axis: DropAxis; distance: THREE.Vector3; value: number }> = [
    { axis: 'Y', distance: new THREE.Vector3(0, -position.y, 0), value: position.y },
    { axis: 'X', distance: new THREE.Vector3(-position.x, 0, 0), value: position.x },
    { axis: 'Z', distance: new THREE.Vector3(0, 0, -position.z), value: position.z },
  ];

  for (const projection of projections) {
    const line = findDropChild(group, DROP_LINE_NAME, projection.axis) as THREE.Line | undefined;
    const ring = findDropChild(group, DROP_RING_NAME, projection.axis) as THREE.Mesh | undefined;
    if (!line || !ring) continue;

    const local = projection.distance.clone().applyQuaternion(inverseQuaternion).multiplyScalar(inverseScale);
    const attributes = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attributes.setXYZ(1, local.x, local.y, local.z);
    attributes.needsUpdate = true;
    line.computeLineDistances();
    ring.position.copy(local);
    const baseQuaternion = ring.userData.baseQuat as THREE.Quaternion;
    ring.quaternion.copy(inverseQuaternion).multiply(baseQuaternion);

    const close = Math.abs(projection.value) < DROP_LINE_EPSILON;
    line.visible = enabled && !close;
    ring.visible = enabled && !close;
  }
}
