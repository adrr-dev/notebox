/**
 * The 3D engine.
 *
 * Imperative three.js core wrapped in a module singleton: the React tree only
 * mounts a container and calls high-level operations. The engine subscribes to
 * the app store and keeps meshes in sync with the workspace document, so data
 * flows one way: store → scene. User interaction flows back through store
 * actions (`addEdge`, `deleteNode`, `patchNodePosition`, …).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { CameraState, EdgeRecord, EntityID, NodeRecord, ToolMode } from '../types/model';
import { useAppStore } from '../store/appStore';
import { useSpaceStore } from '../store/spaceStore';
import { useFormulaStore } from '../features/formula/formulaStore';
import { chooseDeleteMode } from '../ui/DeleteChoiceDialog';
import { createEdgeMesh, disposeObject3D, updateEdgeGeometry } from './edgeMesh';
import { createLabelSprite } from './labelSprite';
import { createNodeMesh, refreshNodeMesh, setDropLinesVisible, updateDropLines } from './nodeMesh';
import { createSelectionFocus, type SelectionFocusHandle } from './selectionFocus';

export interface EngineApi {
  mount(container: HTMLElement): void;
  dispose(): void;
  resetCamera(): void;
  zoomToFit(): void;
  autoArrange(): void;
  flyToNode(id: EntityID): void;
  flyToObject(type: 'node' | 'edge', id: EntityID): void;
  focusObject(type: 'node' | 'edge', id: EntityID): void;
  clearFocus(): void;
  highlightObject(type: 'node' | 'edge', id: EntityID, durationMs?: number): void;
  getCameraState(): CameraState;
  applyCamera(camera: CameraState): void;
  setSnapEnabled(enabled: boolean): void;
}

interface NodeEntry {
  node: NodeRecord;
  group: THREE.Object3D;
  base: THREE.Vector3;
  floatPhase: number;
}

interface EdgeEntry {
  edge: EdgeRecord;
  group: THREE.Group;
}

interface FlyAnimation {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

interface Highlight {
  key: string;
  start: number;
  duration: number;
}

const CAMERA_HOME = { position: [0, 5, 15] as const, target: [0, 0, 0] as const };
const CAMERA_SPEED = 12; // units per second for WASD/QE navigation
const FLOAT_AMPLITUDE = 0.12;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function createEngine(): EngineApi {
  let container: HTMLElement | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let transform: TransformControls | null = null;
  let transformHelper: THREE.Object3D | null = null;
  let ambientLight: THREE.AmbientLight | null = null;
  let directionalLight: THREE.DirectionalLight | null = null;
  let orientationGroup: THREE.Group | null = null;
  let selectionFocus: SelectionFocusHandle | null = null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const nodeEntries = new Map<string, NodeEntry>();
  const edgeEntries = new Map<string, EdgeEntry>();
  const disposers: (() => void)[] = [];

  let frameHandle = 0;
  let running = false;
  let clock = 0;
  let fly: FlyAnimation | null = null;
  let highlight: Highlight | null = null;
  let draggingId: string | null = null;
  let pointerDownAt: { x: number; y: number; id: number } | null = null;
  let activePointers = 0;
  let lastCameraPersist = 0;
  let currentMode: ToolMode = 'pointer';
  let snapEnabled = false;
  let dropLinesVisible = true;
  const pressedKeys = new Set<string>();

  // ---------------------------------------------------------------- scene ---

  function setupScene(mount: HTMLElement) {
    container = mount;
    const space = useSpaceStore.getState();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, space.fogDensity);

    camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(...CAMERA_HOME.position);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = space.maxDistance;
    controls.target.set(...CAMERA_HOME.target);

    ambientLight = new THREE.AmbientLight(0xffffff, space.ambientLight);
    directionalLight = new THREE.DirectionalLight(0xffffff, space.directionalLight);
    directionalLight.position.set(10, 20, 10);
    scene.add(ambientLight, directionalLight);

    transform = new TransformControls(camera, renderer.domElement);
    transform.setTranslationSnap(snapEnabled ? 1 : null);
    // three ≥ r169: the controls themselves are not an Object3D; a helper is.
    transformHelper = transform.getHelper();
    scene.add(transformHelper);

    transform.addEventListener('dragging-changed', (event) => {
      if (!controls) return;
      const dragging = event.value === true;
      controls.enabled = !dragging;
      if (!dragging) {
        draggingId = null;
        persistDraggedPosition();
      }
    });
    transform.addEventListener('objectChange', () => {
      const attached = transform?.object;
      if (!attached) return;
      const id = attached.userData?.id;
      if (id === undefined) return;
      draggingId = String(id);
      const group = attached as THREE.Object3D;
      const entry = nodeEntries.get(String(id));
      if (entry) entry.base.copy(group.position);
      useAppStore.getState().patchNodePosition(String(id), group.position.x, group.position.y, group.position.z);
      updateEdgesGeometry();
    });

    orientationGroup = new THREE.Group();
    scene.add(orientationGroup);
    rebuildOrientation();

    selectionFocus = createSelectionFocus(mount);

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(mount);
    disposers.push(() => resizeObserver.disconnect());

    const onPointerDown = (event: PointerEvent) => {
      activePointers += 1;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerDownAt = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const onPointerUp = (event: PointerEvent) => {
      activePointers = Math.max(0, activePointers - 1);
      const down = pointerDownAt;
      pointerDownAt = null;
      if (!down || down.id !== event.pointerId) return;
      // Multi-touch gestures (orbit/pinch) must not count as a click.
      if (activePointers > 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > 6) return;
      void handleClick(event);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      pressedKeys.add(event.key.toLowerCase());
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.delete(event.key.toLowerCase());
    };
    const onBlur = () => pressedKeys.clear();

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    disposers.push(() => {
      renderer?.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer?.domElement.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });

    const onCameraEnd = () => persistCamera();
    controls.addEventListener('end', onCameraEnd);
    controls.addEventListener('change', () => {
      const now = performance.now();
      if (now - lastCameraPersist > 2000) persistCamera();
    });
    disposers.push(() => {
      controls?.removeEventListener('end', onCameraEnd);
    });

    // Store → scene wiring.
    const unsubscribeStore = useAppStore.subscribe((state, previous) => {
      if (state.nodes !== previous.nodes) {
        syncNodes(state.nodes);
        syncEdges(state.edges);
      }
      if (state.edges !== previous.edges) syncEdges(state.edges);
      if (state.mode !== previous.mode) onModeChanged(state.mode);
      if (state.focus !== previous.focus) onFocusChanged(state.focus);
    });
    disposers.push(unsubscribeStore);

    const unsubscribeSpace = useSpaceStore.subscribe((state) => applySpaceSettings(state));
    disposers.push(unsubscribeSpace);

    // Initial hydration.
    const initial = useAppStore.getState();
    syncNodes(initial.nodes);
    syncEdges(initial.edges);
    onFocusChanged(initial.focus);
    onModeChanged(initial.mode);
    if (initial.camera) {
      camera.position.set(...initial.camera.position);
      controls.target.set(...initial.camera.target);
      controls.update();
    }

    running = true;
    clock = performance.now();
    animate();
  }

  function resize() {
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // ------------------------------------------------- orientation furniture ---

  function rebuildOrientation() {
    if (!scene || !orientationGroup) return;
    disposeChildren(orientationGroup);
    const space = useSpaceStore.getState();
    const size = space.gridSize * 2;

    if (space.planeXZ) {
      const grid = new THREE.GridHelper(size, size, 0x475569, 0x1e293b);
      grid.position.y = space.gridY;
      orientationGroup.add(grid);
    }
    if (space.planeXY) {
      const grid = new THREE.GridHelper(size, size, 0x334155, 0x1e293b);
      grid.rotation.x = Math.PI / 2;
      grid.position.y = space.gridY;
      orientationGroup.add(grid);
    }
    if (space.planeYZ) {
      const grid = new THREE.GridHelper(size, size, 0x334155, 0x1e293b);
      grid.rotation.z = Math.PI / 2;
      grid.position.y = space.gridY;
      orientationGroup.add(grid);
    }

    const axes = new THREE.AxesHelper(space.gridSize);
    axes.position.y = space.gridY;
    orientationGroup.add(axes);

    if (space.axisLabels) {
      const labelDistance = space.gridSize;
      const labels: Array<[string, [number, number, number], string]> = [
        ['X', [labelDistance, space.gridY, 0], '#f87171'],
        ['Y', [0, labelDistance + space.gridY, 0], '#4ade80'],
        ['Z', [0, space.gridY, labelDistance], '#60a5fa'],
      ];
      for (const [text, position, color] of labels) {
        const sprite = createLabelSprite(text, { color, background: 'rgba(15,23,42,0.7)', fontSize: 48, priority: 45 });
        sprite.position.set(...position);
        sprite.raycast = () => {};
        orientationGroup.add(sprite);
      }
    }

    if (space.voxelVisible) {
      orientationGroup.add(buildVoxelGrid(space.gridSize, space.voxelCellSize, space.gridY));
    }
  }

  function buildVoxelGrid(gridSize: number, cellSize: number, gridY: number): THREE.Points {
    const half = Math.floor(gridSize / cellSize);
    const points: number[] = [];
    for (let x = -half; x <= half; x += 1) {
      for (let z = -half; z <= half; z += 1) {
        points.push(x * cellSize, gridY + 0.02, z * cellSize);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.PointsMaterial({ color: 0x334155, size: 0.08, sizeAttenuation: true });
    return new THREE.Points(geometry, material);
  }

  function applySpaceSettings(space: ReturnType<typeof useSpaceStore.getState>) {
    if (scene && scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = space.fogEnabled ? space.fogDensity : 0;
    }
    if (controls) controls.maxDistance = space.maxDistance;
    if (ambientLight) ambientLight.intensity = space.ambientLight;
    if (directionalLight) directionalLight.intensity = space.directionalLight;
    if (space.dropLines !== dropLinesVisible) {
      dropLinesVisible = space.dropLines;
      for (const entry of nodeEntries.values()) setDropLinesVisible(entry.group, dropLinesVisible);
    }
    rebuildOrientation();
  }

  // ------------------------------------------------------------ mesh sync ---

  function syncNodes(nodes: NodeRecord[]) {
    if (!scene) return;
    const seen = new Set<string>();
    let edgesNeedUpdate = false;

    for (const node of nodes) {
      const key = String(node.id);
      seen.add(key);
      const existing = nodeEntries.get(key);
      if (!existing) {
        const group = createNodeMesh(node);
        group.position.set(node.posX ?? 0, node.posY ?? 0, node.posZ ?? 0);
        group.userData.id = node.id;
        scene.add(group);
        nodeEntries.set(key, {
          node,
          group,
          base: group.position.clone(),
          floatPhase: Math.random() * Math.PI * 2,
        });
        setDropLinesVisible(group, dropLinesVisible);
        updateDropLines(group);
        edgesNeedUpdate = true;
        continue;
      }
      if (existing.node === node) continue;
      const replacement = refreshNodeMesh(existing.group, node);
      if (replacement) {
        scene.remove(existing.group);
        disposeObject3D(existing.group);
        replacement.userData.id = node.id;
        scene.add(replacement);
        existing.group = replacement;
        setDropLinesVisible(replacement, dropLinesVisible);
      }
      if (draggingId === key) {
        // The gizmo owns the live position while dragging; do not fight it.
        existing.base.copy(existing.group.position);
      } else {
        existing.group.position.set(node.posX ?? 0, node.posY ?? 0, node.posZ ?? 0);
        existing.base.set(node.posX ?? 0, node.posY ?? 0, node.posZ ?? 0);
      }
      existing.node = node;
      if (highlight?.key === key) restoreScale(existing.group, node);
      edgesNeedUpdate = true;
    }

    for (const [key, entry] of nodeEntries) {
      if (seen.has(key)) continue;
      scene.remove(entry.group);
      disposeObject3D(entry.group);
      nodeEntries.delete(key);
      if (draggingId === key) {
        draggingId = null;
        transform?.detach();
      }
      edgesNeedUpdate = true;
    }

    if (edgesNeedUpdate) updateEdgesGeometry();
  }

  function syncEdges(edges: EdgeRecord[]) {
    if (!scene) return;
    const seen = new Set<string>();
    for (const edge of edges) {
      const key = String(edge.id);
      seen.add(key);
      const existing = edgeEntries.get(key);
      const start = nodePosition(edge.sourceId);
      const end = nodePosition(edge.targetId);
      if (!existing) {
        const group = createEdgeMesh(edge, start, end);
        group.userData.id = edge.id;
        scene.add(group);
        edgeEntries.set(key, { edge, group });
        continue;
      }
      if (existing.edge === edge) continue;
      const flowNames = edgeFlowNames(edge);
      const replacement = createEdgeMesh(edge, start, end, { flowNames });
      scene.remove(existing.group);
      disposeObject3D(existing.group);
      replacement.userData.id = edge.id;
      scene.add(replacement);
      edgeEntries.set(key, { edge, group: replacement });
      if (highlight?.key === key) highlight = null;
    }
    for (const [key, entry] of edgeEntries) {
      if (seen.has(key)) continue;
      scene.remove(entry.group);
      disposeObject3D(entry.group);
      edgeEntries.delete(key);
    }
  }

  /** Variable names flowing through an edge, read from the formula engine. */
  function edgeFlowNames(edge: EdgeRecord): string[] {
    return useFormulaStore.getState().state.edgeFlow[String(edge.id)] ?? [];
  }

  function nodePosition(id: EntityID): THREE.Vector3 {
    const entry = nodeEntries.get(String(id));
    if (entry) return entry.base.clone();
    const node = useAppStore.getState().nodes.find((n) => String(n.id) === String(id));
    return new THREE.Vector3(node?.posX ?? 0, node?.posY ?? 0, node?.posZ ?? 0);
  }

  function updateEdgesGeometry() {
    for (const entry of edgeEntries.values()) {
      const { edge, group } = entry;
      updateEdgeGeometry(group, nodePosition(edge.sourceId), nodePosition(edge.targetId));
    }
  }

  function disposeChildren(parent: THREE.Object3D) {
    const children = [...parent.children];
    for (const child of children) {
      parent.remove(child);
      disposeObject3D(child);
    }
  }

  // -------------------------------------------------------------- picking ---

  function pickAt(clientX: number, clientY: number): { type: 'node' | 'edge'; id: EntityID; object: THREE.Object3D } | null {
    if (!renderer || !camera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const objects: THREE.Object3D[] = [
      ...[...nodeEntries.values()].map((entry) => entry.group),
      ...[...edgeEntries.values()].map((entry) => entry.group),
    ];
    const hits = raycaster.intersectObjects(objects, true);
    for (const hit of hits) {
      let current: THREE.Object3D | null = hit.object;
      while (current && current.userData?.id === undefined) current = current.parent;
      if (!current) continue;
      const id = current.userData.id as EntityID;
      const type: 'node' | 'edge' = nodeEntries.has(String(id)) ? 'node' : 'edge';
      return { type, id, object: current };
    }
    return null;
  }

  async function handleClick(event: PointerEvent) {
    if (!scene || !camera || !renderer) return;
    const hit = pickAt(event.clientX, event.clientY);
    const store = useAppStore.getState();

    switch (currentMode) {
      case 'pointer': {
        if (hit) {
          store.setFocus({ type: hit.type, id: hit.id });
          store.openViewer(hit.type, hit.id);
        } else {
          store.setFocus(null);
        }
        return;
      }
      case 'move': {
        if (hit && hit.type === 'node' && transform) {
          store.setFocus({ type: hit.type, id: hit.id });
          transform.attach(hit.object);
        } else if (!hit) {
          transform?.detach();
          store.setFocus(null);
        }
        return;
      }
      case 'connect': {
        if (!hit || hit.type !== 'node') {
          store.setConnectSource(null);
          return;
        }
        if (store.connectSourceId === null || String(store.connectSourceId) === String(hit.id)) {
          store.setConnectSource(hit.id);
          store.pushToast('Objek sumber dipilih. Klik objek tujuan untuk menghubungkan.', 'info');
          return;
        }
        store.addEdge(store.connectSourceId, hit.id);
        store.setConnectSource(null);
        store.pushToast('Berhasil terhubung!', 'success');
        return;
      }
      case 'delete': {
        if (!hit) return;
        const record =
          hit.type === 'node'
            ? store.nodes.find((n) => String(n.id) === String(hit.id))
            : store.edges.find((e) => String(e.id) === String(hit.id));
        const attachments =
          hit.type === 'node'
            ? store.edges.filter(
                (edge) => String(edge.sourceId) === String(hit.id) || String(edge.targetId) === String(hit.id),
              ).length
            : 0;
        const mode = await chooseDeleteMode({
          subject: `${hit.type === 'node' ? 'Objek' : 'Garis'} “${record?.title ?? hit.id}”`,
          note: attachments > 0 ? `${attachments} garis yang menempel juga akan ikut terhapus.` : undefined,
        });
        if (!mode) return;
        const permanent = mode === 'permanent';
        if (hit.type === 'node') store.deleteNode(hit.id, permanent);
        else store.deleteEdge(hit.id, permanent);
        store.pushToast(permanent ? 'Dihapus permanen.' : 'Dipindahkan ke tempat sampah.', 'success');
        return;
      }
    }
  }

  // ------------------------------------------------------ focus / highlight ---

  function setDimmed(dimmed: boolean) {
    for (const entry of nodeEntries.values()) dimObject(entry.group, dimmed ? 1 : 0.2);
    for (const entry of edgeEntries.values()) dimObject(entry.group, dimmed ? 1 : 0.2);
  }

  function dimObject(root: THREE.Object3D, opacity: number) {
    root.traverse((child) => {
      const withMaterial = child as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
      const material = withMaterial.material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const item of materials) {
        const standard = item as THREE.MeshStandardMaterial;
        if (standard.userData.__baseOpacity === undefined) standard.userData.__baseOpacity = standard.opacity ?? 1;
        const base = standard.userData.__baseOpacity as number;
        standard.transparent = true;
        standard.opacity = base * opacity;
      }
    });
  }

  function onFocusChanged(focus: { type: 'node' | 'edge'; id: EntityID } | null) {
    if (!selectionFocus) return;
    if (!focus) {
      selectionFocus.clear();
      setDimmed(false);
      return;
    }
    const entry =
      focus.type === 'node' ? nodeEntries.get(String(focus.id)) : edgeEntries.get(String(focus.id));
    if (!entry) {
      selectionFocus.clear();
      setDimmed(false);
      return;
    }
    selectionFocus.focusObject(entry.group, focus.type);
    setDimmed(true);
    // Keep the focused object and its direct neighbours fully visible.
    const survivors = new Set<string>([String(focus.id)]);
    if (focus.type === 'node') {
      for (const edge of useAppStore.getState().edges) {
        const source = String(edge.sourceId);
        const target = String(edge.targetId);
        if (source === String(focus.id)) survivors.add(target);
        if (target === String(focus.id)) survivors.add(source);
      }
      for (const [key, nodeEntry] of nodeEntries) {
        if (!survivors.has(key)) dimObject(nodeEntry.group, 0.2);
        else dimObject(nodeEntry.group, 1);
      }
      for (const edgeEntry of edgeEntries.values()) {
        const touches =
          String(edgeEntry.edge.sourceId) === String(focus.id) || String(edgeEntry.edge.targetId) === String(focus.id);
        dimObject(edgeEntry.group, touches ? 1 : 0.2);
      }
    }
  }

  function restoreScale(group: THREE.Object3D, node: NodeRecord) {
    group.scale.setScalar(node.scale ?? 1);
  }

  function onModeChanged(mode: ToolMode) {
    currentMode = mode;
    if (mode !== 'move' && transform?.object) transform.detach();
    if (transform) transform.enabled = mode === 'move';
    const canvas = renderer?.domElement;
    if (canvas) {
      canvas.style.cursor = mode === 'pointer' ? 'default' : mode === 'delete' ? 'not-allowed' : 'crosshair';
    }
    useAppStore.getState().setConnectSource(null);
  }

  // -------------------------------------------------------- camera helpers ---

  function persistCamera() {
    if (!camera || !controls) return;
    useAppStore.getState().setCamera({
      position: camera.position.toArray() as [number, number, number],
      target: controls.target.toArray() as [number, number, number],
    });
  }

  function persistDraggedPosition() {
    if (!draggingId) return;
    const entry = nodeEntries.get(draggingId);
    if (!entry) return;
    const store = useAppStore.getState();
    store.patchNodePosition(draggingId, entry.group.position.x, entry.group.position.y, entry.group.position.z);
    store.saveNow('manual-move');
  }

  function driveKeyboardCamera(deltaSeconds: number) {
    if (!camera || !controls) return;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();
    if (pressedKeys.has('w')) movement.addScaledVector(forward, 1);
    if (pressedKeys.has('s')) movement.addScaledVector(forward, -1);
    if (pressedKeys.has('a')) movement.addScaledVector(right, -1);
    if (pressedKeys.has('d')) movement.addScaledVector(right, 1);
    if (pressedKeys.has('e')) movement.y += 1;
    if (pressedKeys.has('q')) movement.y -= 1;
    if (movement.lengthSq() === 0) return;
    movement.normalize().multiplyScalar(CAMERA_SPEED * deltaSeconds);
    camera.position.add(movement);
    controls.target.add(movement);
  }

  function driveFlyAnimation(now: number) {
    if (!fly || !camera || !controls) return;
    const progress = Math.min(1, (now - fly.start) / fly.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(fly.fromPosition, fly.toPosition, eased);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, eased);
    if (progress >= 1) fly = null;
  }

  function startFly(toPosition: THREE.Vector3, toTarget: THREE.Vector3) {
    if (!camera || !controls) return;
    if (prefersReducedMotion()) {
      camera.position.copy(toPosition);
      controls.target.copy(toTarget);
      controls.update();
      persistCamera();
      return;
    }
    const distance = camera.position.distanceTo(toPosition);
    fly = {
      fromPosition: camera.position.clone(),
      toPosition: toPosition.clone(),
      fromTarget: controls.target.clone(),
      toTarget: toTarget.clone(),
      start: performance.now(),
      duration: THREE.MathUtils.clamp(distance * 40, 450, 1100),
    };
  }

  function objectCenter(id: EntityID, type: 'node' | 'edge'): THREE.Vector3 | null {
    if (type === 'node') {
      const entry = nodeEntries.get(String(id));
      return entry ? entry.base.clone() : null;
    }
    const edge = useAppStore.getState().edges.find((e) => String(e.id) === String(id));
    if (!edge) return null;
    return nodePosition(edge.sourceId).add(nodePosition(edge.targetId)).multiplyScalar(0.5);
  }

  // ------------------------------------------------------------ animation ---

  function animate() {
    if (!running) return;
    frameHandle = requestAnimationFrame(animate);
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, (now - clock) / 1000);
    clock = now;

    driveKeyboardCamera(deltaSeconds);
    driveFlyAnimation(now);
    driveFloatMotion(now);
    driveHighlight(now);

    controls?.update();
    if (camera && renderer && container && selectionFocus) {
      selectionFocus.update(camera, container.clientWidth, container.clientHeight);
    }
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function driveFloatMotion(now: number) {
    if (prefersReducedMotion()) return;
    for (const [key, entry] of nodeEntries) {
      if (entry.node.isStatic || draggingId === key) continue;
      const offset = Math.sin(now / 1000 * 0.6 + entry.floatPhase) * FLOAT_AMPLITUDE;
      entry.group.position.y = entry.base.y + offset;
    }
    updateEdgesGeometry();
  }

  function driveHighlight(now: number) {
    if (!highlight) return;
    const entry = nodeEntries.get(highlight.key) ?? edgeEntries.get(highlight.key);
    if (!entry) {
      highlight = null;
      return;
    }
    const progress = (now - highlight.start) / highlight.duration;
    if (progress >= 1) {
      if ('node' in entry) entry.group.scale.setScalar(entry.node.scale ?? 1);
      else entry.group.scale.setScalar(1);
      highlight = null;
      return;
    }
    const pulse = 1 + Math.sin(progress * Math.PI) * 0.28;
    if ('node' in entry) entry.group.scale.setScalar((entry.node.scale ?? 1) * pulse);
    else entry.group.scale.setScalar(pulse);
  }

  // ------------------------------------------------------------------ API ---

  return {
    mount(mountContainer) {
      if (running) return;
      setupScene(mountContainer);
    },

    dispose() {
      running = false;
      cancelAnimationFrame(frameHandle);
      for (const dispose of disposers.splice(0)) dispose();
      for (const entry of nodeEntries.values()) disposeObject3D(entry.group);
      for (const entry of edgeEntries.values()) disposeObject3D(entry.group);
      nodeEntries.clear();
      edgeEntries.clear();
      selectionFocus?.dispose();
      selectionFocus = null;
      if (orientationGroup) disposeChildren(orientationGroup);
      transform?.detach();
      transform?.dispose();
      controls?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = null;
      scene = null;
      camera = null;
      controls = null;
      transform = null;
      transformHelper = null;
      container = null;
    },

    resetCamera() {
      if (!camera || !controls) return;
      startFly(new THREE.Vector3(...CAMERA_HOME.position), new THREE.Vector3(...CAMERA_HOME.target));
    },

    zoomToFit() {
      const nodes = useAppStore.getState().nodes;
      if (!camera || !controls || nodes.length === 0) return;
      const box = new THREE.Box3();
      for (const node of nodes) {
        box.expandByPoint(new THREE.Vector3(node.posX ?? 0, node.posY ?? 0, node.posZ ?? 0));
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const fov = (camera.fov * Math.PI) / 180;
      const distance = Math.max(6, (sphere.radius * 1.6) / Math.tan(fov / 2));
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0.3, 1).normalize();
      startFly(sphere.center.clone().addScaledVector(direction, distance), sphere.center.clone());
    },

    autoArrange() {
      const nodes = useAppStore.getState().nodes;
      if (nodes.length === 0) return;
      const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
      const spacing = 10;
      const positions: Record<string, [number, number, number]> = {};
      nodes.forEach((node, index) => {
        positions[String(node.id)] = [(index % columns) * spacing, 2, Math.floor(index / columns) * spacing];
      });
      useAppStore.getState().applyPositions(positions);
      useAppStore.getState().pushToast('Objek disusun ulang pada kisi ruang.', 'success');
    },

    flyToNode(id) {
      const center = objectCenter(id, 'node');
      if (!center || !camera || !controls) return;
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      const distance = Math.max(6, camera.position.distanceTo(controls.target) * 0.6);
      startFly(center.clone().addScaledVector(direction, distance), center.clone());
    },

    flyToObject(type, id) {
      if (type === 'node') {
        this.flyToNode(id);
        return;
      }
      const center = objectCenter(id, 'edge');
      if (!center || !camera || !controls) return;
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      const distance = Math.max(8, camera.position.distanceTo(controls.target) * 0.8);
      startFly(center.clone().addScaledVector(direction, distance), center.clone());
    },

    focusObject(type, id) {
      useAppStore.getState().setFocus({ type, id });
    },

    clearFocus() {
      useAppStore.getState().setFocus(null);
    },

    highlightObject(type, id, durationMs = 900) {
      highlight = { key: String(id), start: performance.now(), duration: Math.max(200, durationMs) };
      void type;
    },

    getCameraState() {
      if (!camera || !controls) {
        return { position: [...CAMERA_HOME.position], target: [...CAMERA_HOME.target] };
      }
      return {
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      };
    },

    applyCamera(state) {
      if (!camera || !controls) return;
      camera.position.set(...state.position);
      controls.target.set(...state.target);
      controls.update();
    },

    setSnapEnabled(enabled) {
      snapEnabled = enabled;
      transform?.setTranslationSnap(enabled ? 1 : null);
    },
  };
}

/** Engine singleton used by the React UI and the render loop. */
export const engine: EngineApi = createEngine();
