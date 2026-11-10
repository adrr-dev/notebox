import * as THREE from 'three';
import type { EdgeRecord } from '../types/model';
import { createLabelSprite } from './labelSprite';
import { relationStyle } from './relationStyle';

/**
 * Geometry factories for graph edges (legacy `createEdgeMesh`, L12178-12240).
 *
 * The legacy code alternated between a `Line` and a cylinder mesh plus arrow
 * cones. Here every edge is a two-point `Line` (restyled through
 * {@link updateEdgeGeometry}), which keeps buffer updates trivial and avoids the
 * `Line2`/`examples/jsm` dependency.
 */

/** Options accepted by {@link createEdgeMesh}. */
export interface EdgeMeshOptions {
  /** Overrides the colour derived from {@link relationStyle}. */
  color?: string;
  /** Line width hint (WebGL ignores it; kept for API parity with the legacy call). */
  width?: number;
  /** Variable names flowing along the edge, rendered as small chips. */
  flowNames?: string[];
}

const EDGE_LINE_NAME = 'edgeLine';
const RELATION_LABEL_NAME = 'relationLabel';
const FLOW_LABEL_NAME = 'varFlowLabel';
/** Legacy label registry: relation symbols beat flow chips. */
const RELATION_LABEL_PRIORITY = 80;
const FLOW_LABEL_PRIORITY = 60;
/** Legacy `padding = 1.6` kept the line clear of both node meshes (L12183). */
const EDGE_PADDING = 1.6;
/** Legacy placed the relation badge slightly above the line (L12235). */
const LABEL_OFFSET_Y = 0.45;
const PLAIN_RELATION_OPACITY = 0.55;
const DEFAULT_OPACITY = 0.9;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Re-centres and re-orients the whole group: local +Y follows `start -> end`
 * and the group sits on the midpoint, so every child is positioned in edge
 * space (legacy rotated the line itself, L12197).
 */
function layoutEdge(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3): void {
  const distance = Math.max(start.distanceTo(end), 0.01);
  const direction = end.clone().sub(start).normalize();
  const padding = distance < EDGE_PADDING * 2 ? distance * 0.25 : EDGE_PADDING;
  const drawDistance = Math.max(distance - padding * 2, 0.01);
  group.position.copy(start).lerp(end, 0.5);
  group.quaternion.setFromUnitVectors(UP, direction);

  const line = group.getObjectByName(EDGE_LINE_NAME) as THREE.Line | undefined;
  if (!line) return;
  const attributes = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  attributes.setXYZ(0, 0, -drawDistance / 2, 0);
  attributes.setXYZ(1, 0, drawDistance / 2, 0);
  attributes.needsUpdate = true;
  line.geometry.computeBoundingSphere();
  // Required by LineDashedMaterial (and harmless for solid lines).
  line.computeLineDistances();
}

/**
 * Creates the edge group: a line between `start` and `end`, the relation badge
 * on the midpoint and optional variable-flow chips.
 */
export function createEdgeMesh(
  edge: EdgeRecord,
  start: THREE.Vector3,
  end: THREE.Vector3,
  opts: EdgeMeshOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { kind: 'edge', id: edge.id, relation: edge.relation };

  const style = relationStyle(edge.relation);
  const color = opts.color ?? style.color;
  const plain = edge.relation === 'none';
  const width = typeof opts.width === 'number' && opts.width > 0 ? opts.width : plain ? 1 : 1.5;
  const opacity = plain ? PLAIN_RELATION_OPACITY : DEFAULT_OPACITY;

  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = style.dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.2, linewidth: width, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, linewidth: width, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  line.name = EDGE_LINE_NAME;
  group.add(line);

  if (!plain) {
    // Badge with the relation symbol itself (legacy `createSymbolSprite`, L12159).
    const label = createLabelSprite(edge.relation, {
      color,
      background: 'rgba(30, 41, 59, 0.9)',
      fontSize: 48,
      padding: 8,
      maxWidth: 256,
      priority: RELATION_LABEL_PRIORITY,
    });
    label.name = RELATION_LABEL_NAME;
    label.userData.name = RELATION_LABEL_NAME;
    label.position.set(0, LABEL_OFFSET_Y, 0);
    group.add(label);
  }

  const flowNames = opts.flowNames ?? [];
  flowNames.forEach((name, index) => {
    const chip = createLabelSprite(name, {
      color: '#e2e8f0',
      background: 'rgba(15, 23, 42, 0.85)',
      fontSize: 32,
      padding: 6,
      maxWidth: 256,
      priority: FLOW_LABEL_PRIORITY,
    });
    chip.name = FLOW_LABEL_NAME;
    chip.userData.name = FLOW_LABEL_NAME;
    // Stack chips sideways around the midpoint.
    chip.position.set(0.35, LABEL_OFFSET_Y + (index - (flowNames.length - 1) / 2) * 0.5, 0);
    group.add(chip);
  });

  layoutEdge(group, start, end);
  return group;
}

/** Repositions an existing edge after one of its nodes moved. */
export function updateEdgeGeometry(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3): void {
  layoutEdge(group, start, end);
}

function disposeMaterialTextures(material: THREE.Material): void {
  const textured = material as THREE.Material & {
    map?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
  };
  for (const texture of [textured.map, textured.alphaMap, textured.emissiveMap]) {
    if (!texture) continue;
    // Label textures are shared through the `labelSprite` cache; another sprite
    // may still show the same label, so they are never freed here.
    if (texture.userData.sharedLabelTexture === true) continue;
    texture.dispose();
  }
}

/**
 * Frees every geometry, material and texture below `object` (legacy L6277).
 * Sprite geometries are skipped: three.js shares one internal plane for all
 * sprites, disposing it would break every other sprite in the scene.
 */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose();
    }
    const material = (child as THREE.Mesh).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      disposeMaterialTextures(entry);
      entry.dispose();
    }
  });
}
