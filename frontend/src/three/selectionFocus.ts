/**
 * DOM selection frame: projects the 3D bounding box of the focused object to
 * screen space and draws four corner brackets. Ported from the legacy
 * `.ri3d-selection-focus` overlay (CSS in styles/index.css).
 */
import * as THREE from 'three';

export interface SelectionFocusHandle {
  /** Starts tracking an object (node group or edge group). */
  focusObject(object: THREE.Object3D, kind: 'node' | 'edge'): void;
  /** Stops tracking and hides the frame. */
  clear(): void;
  /** Recomputes the frame for the current camera and viewport. */
  update(camera: THREE.Camera, width: number, height: number): void;
  /** Removes the DOM node. */
  dispose(): void;
}

export function createSelectionFocus(container: HTMLElement): SelectionFocusHandle {
  const frame = document.createElement('div');
  frame.className = 'ri3d-selection-focus';
  frame.setAttribute('aria-hidden', 'true');
  for (const position of ['tl', 'tr', 'br', 'bl'] as const) {
    const corner = document.createElement('span');
    corner.className = `ri3d-selection-corner ${position}`;
    frame.appendChild(corner);
  }
  container.appendChild(frame);

  const bounds = new THREE.Box3();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let target: THREE.Object3D | null = null;

  const hide = () => {
    frame.classList.remove('is-visible');
  };

  return {
    focusObject(object, kind) {
      target = object;
      frame.dataset.kind = kind;
      frame.classList.add('is-visible');
    },
    clear() {
      target = null;
      hide();
    },
    update(camera, width, height) {
      if (!target) return;
      if (!target.parent) {
        hide();
        return;
      }
      target.updateWorldMatrix(true, true);
      bounds.setFromObject(target);
      if (bounds.isEmpty()) {
        hide();
        return;
      }
      const min = bounds.min;
      const max = bounds.max;
      let index = 0;
      for (const x of [min.x, max.x]) {
        for (const y of [min.y, max.y]) {
          for (const z of [min.z, max.z]) {
            corners[index++].set(x, y, z).project(camera);
          }
        }
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const corner of corners) {
        if (corner.z > 1) {
          // A corner behind the camera makes the projection meaningless.
          hide();
          return;
        }
        const screenX = (corner.x * 0.5 + 0.5) * width;
        const screenY = (-corner.y * 0.5 + 0.5) * height;
        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      }
      const pad = 6;
      frame.style.left = `${minX - pad}px`;
      frame.style.top = `${minY - pad}px`;
      frame.style.width = `${Math.max(12, maxX - minX + pad * 2)}px`;
      frame.style.height = `${Math.max(12, maxY - minY + pad * 2)}px`;
      frame.style.right = 'auto';
      frame.style.bottom = 'auto';
    },
    dispose() {
      frame.remove();
    },
  };
}
