/**
 * Mini map.
 *
 * Ports the legacy minimap (legacy L18564-19220, markup L17493-17539). A small
 * canvas in the bottom-right corner draws the graph in the chosen orthographic
 * projection (top X–Z / front X–Y / side Z–Y), refreshes at most every 66 ms
 * from a requestAnimationFrame loop guarded by a cheap change signature, and
 * flies the camera to the clicked grid cell.
 */
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { engine } from '../../three/engine';
import { relationStyle } from '../../three/relationStyle';
import type { CameraState, EdgeRecord, NodeRecord } from '../../types/model';

type MinimapView = 'top' | 'front' | 'side';

const TAU = Math.PI * 2;
const FALLBACK_COLOR = '#3b82f6';
/** Approximates the perspective camera's vertical FOV for reframing distances. */
const FOV_RADIANS = (50 * Math.PI) / 180;

const VIEW_OPTIONS: { id: MinimapView; label: string; title: string }[] = [
  { id: 'top', label: 'Atas', title: 'Pandangan atas (sumbu X–Z)' },
  { id: 'front', label: 'Depan', title: 'Pandangan depan (sumbu X–Y)' },
  { id: 'side', label: 'Sisi', title: 'Pandangan samping (sumbu Z–Y)' },
];

interface Snapshot {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  camera: CameraState | null;
  view: MinimapView;
  focusKey: string;
  viewingKey: string;
}

interface Transform {
  cx: number;
  cy: number;
  sc: number;
  cell: number;
  w: number;
  h: number;
}

/** Maps world space to the 2D map plane; Y grows downward on the map. */
function project(view: MinimapView, x: number, y: number, z: number): [number, number] {
  if (view === 'front') return [x, -y];
  if (view === 'side') return [-z, -y];
  return [x, z];
}

/** legacy Minimap.nice — rounds a grid step to 1/2/5×10ⁿ. */
function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / exponent;
  return (mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10) * exponent;
}

function axisLabels(view: MinimapView): [string, string] {
  if (view === 'front') return ['X', 'Y'];
  if (view === 'side') return ['Z', 'Y'];
  return ['X', 'Z'];
}

function rounded(value: number | undefined): number {
  return Math.round((Number(value) || 0) * 1000);
}

function formatBound(value: number): number {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** Nearest visible world coordinate along the third (depth) axis of a view. */
function depthAnchor(view: MinimapView, camera: CameraState | null, u: number, v: number): [number, number, number] {
  const base = camera?.target ?? [0, 0, 0];
  if (view === 'front') return [u, -v, base[2]];
  if (view === 'side') return [base[0], -v, -u];
  return [u, base[1], v];
}

export function Minimap() {
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const camera = useAppStore((state) => state.camera);
  const focus = useAppStore((state) => state.focus);
  const viewing = useAppStore((state) => state.viewing);
  const enabled = useAppStore((state) => state.ui.minimap);
  const collapsed = useAppStore((state) => state.ui.minimapCollapsed);
  const view = useAppStore((state) => state.ui.minimapView);
  const setUi = useAppStore((state) => state.setUi);
  const visible = useUiStore((state) => state.minimapVisible);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<Snapshot>({ nodes, edges, camera, view, focusKey: '', viewingKey: '' });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const transformRef = useRef<Transform>({ cx: 0, cy: 0, sc: 1, cell: 1, w: 0, h: 0 });
  const signatureRef = useRef<string | null>(null);

  // Latest values for the long-lived draw loop (runs before the next frame).
  useEffect(() => {
    stateRef.current = {
      nodes,
      edges,
      camera,
      view,
      focusKey: focus ? `${focus.type}:${focus.id}` : '',
      viewingKey: viewing ? `${viewing.type}:${viewing.id}` : '',
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const readCamera = (): CameraState | null => stateRef.current.camera ?? engine.getCameraState();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === sizeRef.current.w && h === sizeRef.current.h && dpr === sizeRef.current.dpr) return;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      signatureRef.current = null;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const signature = (): string => {
      const { nodes: ns, edges: es, view: viewMode, focusKey, viewingKey } = stateRef.current;
      const cam = readCamera();
      const parts: string[] = [viewMode, String(ns.length), String(es.length), focusKey, viewingKey];
      if (cam) {
        for (const value of [...cam.position, ...cam.target]) parts.push(String(rounded(value)));
      }
      for (const n of ns) {
        parts.push(`${rounded(n.posX)},${rounded(n.posY)},${rounded(n.posZ)},${rounded(n.scale)},${n.color ?? ''}`);
      }
      for (const e of es) parts.push(e.relation ?? '');
      return parts.join('|');
    };

    const draw = () => {
      const { nodes: ns, edges: es, view: viewMode, focusKey, viewingKey } = stateRef.current;
      const { w: W, h: H } = sizeRef.current;
      if (!W || !H) return;
      const cam = readCamera();

      ctx.clearRect(0, 0, W, H);

      // Fit everything (nodes, camera, orbit target) into the canvas.
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      const grow = (u: number, v: number) => {
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      };
      for (const n of ns) {
        const p = project(viewMode, n.posX || 0, n.posY || 0, n.posZ || 0);
        grow(p[0], p[1]);
      }
      if (cam) {
        const cp = project(viewMode, cam.position[0], cam.position[1], cam.position[2]);
        grow(cp[0], cp[1]);
        const tp = project(viewMode, cam.target[0], cam.target[1], cam.target[2]);
        grow(tp[0], tp[1]);
      }
      if (!Number.isFinite(minU)) {
        minU = maxU = 0;
        minV = maxV = 0;
      }

      const halfU = Math.max(((maxU - minU) / 2) * 1.18, 12);
      const halfV = Math.max(((maxV - minV) / 2) * 1.18, 12);
      const cx = (minU + maxU) / 2;
      const cy = (minV + maxV) / 2;
      const sc = Math.min((W - 14) / (2 * halfU), (H - 14) / (2 * halfV));
      if (!Number.isFinite(sc) || sc <= 0) return;
      const sx = (u: number) => (u - cx) * sc + W / 2;
      const sy = (v: number) => (v - cy) * sc + H / 2;
      const cell = niceStep(36 / sc);
      transformRef.current = { cx, cy, sc, cell, w: W, h: H };

      const u0 = (0 - W / 2) / sc + cx;
      const u1 = (W / 2) / sc + cx;
      const v0 = (0 - H / 2) / sc + cy;
      const v1 = (H / 2) / sc + cy;

      // Region grid.
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(100,116,139,0.22)';
      ctx.beginPath();
      for (let u = Math.ceil(u0 / cell) * cell, i = 0; u <= u1 && i < 90; u += cell, i++) {
        const x = Math.round(sx(u)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let v = Math.ceil(v0 / cell) * cell, i = 0; v <= v1 && i < 90; v += cell, i++) {
        const y = Math.round(sy(v)) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();

      // World axes (X red-ish vertical, Z blue-ish horizontal).
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      const axisX = Math.round(sx(0)) + 0.5;
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, H);
      ctx.stroke();
      const axisY = Math.round(sy(0)) + 0.5;
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(0, axisY);
      ctx.lineTo(W, axisY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Edges.
      const byId = new Map<string, NodeRecord>();
      for (const n of ns) byId.set(String(n.id), n);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      for (const e of es) {
        const a = byId.get(String(e.sourceId));
        const b = byId.get(String(e.targetId));
        if (!a || !b) continue;
        const pa = project(viewMode, a.posX || 0, a.posY || 0, a.posZ || 0);
        const pb = project(viewMode, b.posX || 0, b.posY || 0, b.posZ || 0);
        ctx.strokeStyle = relationStyle(e.relation || '').color;
        ctx.beginPath();
        ctx.moveTo(sx(pa[0]), sy(pa[1]));
        ctx.lineTo(sx(pb[0]), sy(pb[1]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Nodes, with a ring for the focused / open object.
      for (const n of ns) {
        const p = project(viewMode, n.posX || 0, n.posY || 0, n.posZ || 0);
        const x = sx(p[0]);
        const y = sy(p[1]);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        const radius = 2.4 + Math.min(3, (n.scale ?? 1) * 1.1);
        ctx.fillStyle = n.color || FALLBACK_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        const key = `node:${String(n.id)}`;
        if (key === focusKey || key === viewingKey) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, radius + 3, 0, TAU);
          ctx.stroke();
        }
      }

      // Camera dot, orbit target cross and the dashed sight line between them.
      if (cam) {
        const cp = project(viewMode, cam.position[0], cam.position[1], cam.position[2]);
        const tp = project(viewMode, cam.target[0], cam.target[1], cam.target[2]);
        const cxp = sx(cp[0]);
        const cyp = sy(cp[1]);
        const txp = sx(tp[0]);
        const typ = sy(tp[1]);
        ctx.strokeStyle = 'rgba(147,197,253,0.55)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cxp, cyp);
        ctx.lineTo(txp, typ);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#93c5fd';
        ctx.beginPath();
        ctx.moveTo(txp - 4, typ);
        ctx.lineTo(txp + 4, typ);
        ctx.moveTo(txp, typ - 4);
        ctx.lineTo(txp, typ + 4);
        ctx.stroke();
        ctx.fillStyle = '#e0f2fe';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cxp, cyp, 3.4, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }

      // Caption: visible ranges + node count.
      const [uLabel, vLabel] = axisLabels(viewMode);
      let uLo = u0;
      let uHi = u1;
      let vLo = v0;
      let vHi = v1;
      if (viewMode === 'front') {
        vLo = -v1;
        vHi = -v0;
      } else if (viewMode === 'side') {
        uLo = -u1;
        uHi = -u0;
        vLo = -v1;
        vHi = -v0;
      }
      let count = 0;
      for (const n of ns) {
        const p = project(viewMode, n.posX || 0, n.posY || 0, n.posZ || 0);
        if (p[0] >= u0 && p[0] <= u1 && p[1] >= v0 && p[1] <= v1) count++;
      }
      const caption = `${uLabel} ${formatBound(uLo)}…${formatBound(uHi)} · ${vLabel} ${formatBound(vLo)}…${formatBound(vHi)} · ${count} objek`;
      if (captionRef.current && captionRef.current.textContent !== caption) captionRef.current.textContent = caption;
    };

    let raf = 0;
    let lastCheck = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastCheck < 66) return;
      lastCheck = now;
      const next = signature();
      if (next === signatureRef.current) return;
      signatureRef.current = next;
      draw();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // The canvas is unmounted while collapsed / hidden, so rebind when it returns.
  }, [enabled, visible, collapsed]);

  if (!enabled || !visible) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setUi({ minimapCollapsed: false })}
        title="Tampilkan peta mini"
        aria-label="Tampilkan peta mini"
        aria-controls="minimap-panel"
        aria-expanded={false}
        className="fixed right-4 bottom-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-900/90 text-slate-300 shadow-2xl backdrop-blur hover:text-white"
      >
        <i className="fas fa-map" aria-hidden="true" />
      </button>
    );
  }

  /** Flies to (or pans toward) the grid cell under the pointer. legacy flyToCell */
  const flyToCell = (x: number, y: number) => {
    const t = transformRef.current;
    if (!t.sc || !t.w || !t.h || t.cell <= 0) return;
    const u = (x - t.w / 2) / t.sc + t.cx;
    const v = (y - t.h / 2) / t.sc + t.cy;
    const u0 = Math.floor(u / t.cell) * t.cell;
    const v0 = Math.floor(v / t.cell) * t.cell;

    const { nodes: ns, view: viewMode } = stateRef.current;
    const inside = ns.filter((n) => {
      const p = project(viewMode, n.posX || 0, n.posY || 0, n.posZ || 0);
      return p[0] >= u0 && p[0] < u0 + t.cell && p[1] >= v0 && p[1] < v0 + t.cell;
    });

    const cam = stateRef.current.camera ?? engine.getCameraState();
    const offset: [number, number, number] = cam
      ? [
          cam.position[0] - cam.target[0],
          cam.position[1] - cam.target[1],
          cam.position[2] - cam.target[2],
        ]
      : [0, 4, 12];
    let length = Math.hypot(offset[0], offset[1], offset[2]);
    if (length < 0.01) {
      offset[0] = 0;
      offset[1] = 4;
      offset[2] = 12;
      length = Math.hypot(offset[0], offset[1], offset[2]);
    }
    const dir: [number, number, number] = [offset[0] / length, offset[1] / length, offset[2] / length];

    if (inside.length > 0) {
      let cxx = 0;
      let cyy = 0;
      let czz = 0;
      for (const n of inside) {
        cxx += n.posX || 0;
        cyy += n.posY || 0;
        czz += n.posZ || 0;
      }
      cxx /= inside.length;
      cyy /= inside.length;
      czz /= inside.length;
      let radius = 0;
      for (const n of inside) {
        const distance =
          Math.hypot((n.posX || 0) - cxx, (n.posY || 0) - cyy, (n.posZ || 0) - czz) + (n.scale ?? 1) * 1.6;
        if (distance > radius) radius = distance;
      }
      const distance = Math.max(7, Math.min((radius / Math.sin(FOV_RADIANS / 2)) * 1.15 + 2, 110));
      engine.applyCamera({
        position: [cxx + dir[0] * distance, cyy + dir[1] * distance, czz + dir[2] * distance],
        target: [cxx, cyy, czz],
      });
      return;
    }

    // Empty cell: keep the viewing direction, move the orbit target there.
    const target = depthAnchor(viewMode, cam, u0 + t.cell / 2, v0 + t.cell / 2);
    engine.applyCamera({
      position: [
        target[0] + dir[0] * length,
        target[1] + dir[1] * length,
        target[2] + dir[2] * length,
      ],
      target,
    });
  };

  const onCanvasClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    flyToCell(event.clientX - rect.left, event.clientY - rect.top);
  };

  return (
    <aside
      id="minimap-panel"
      aria-label="Peta mini"
      className="fixed right-4 bottom-5 z-20 w-52 rounded-2xl border border-slate-700/50 bg-slate-900/80 p-2 shadow-2xl select-none backdrop-blur-md"
    >
      <div className="mb-1.5 flex items-center gap-1 pl-1">
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          <i className="fas fa-map mr-1.5 text-blue-400" aria-hidden="true" />Peta mini
        </span>
        <button
          type="button"
          onClick={() => setUi({ minimapCollapsed: true })}
          title="Sembunyikan peta mini"
          aria-label="Sembunyikan peta mini"
          aria-expanded
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
        >
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </button>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          title="Klik wilayah untuk mengarahkan kamera ke area tersebut"
          aria-label="Peta mini. Klik untuk terbang ke wilayah."
          className="block aspect-square w-full cursor-crosshair rounded-xl border border-slate-600/55 bg-slate-950/55"
        />
        <div
          ref={captionRef}
          className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300"
        />
      </div>
      <div role="group" aria-label="Sudut pandang peta mini" className="mt-1.5 flex gap-1">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.title}
            aria-pressed={view === option.id}
            onClick={() => setUi({ minimapView: option.id })}
            className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-bold transition-colors ${
              view === option.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
