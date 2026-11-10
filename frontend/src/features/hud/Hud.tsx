/**
 * Bottom-left coordinate readout.
 *
 * Ports the legacy `.tt-hud` block (legacy L3465-3483): selected object
 * coordinates and camera position, monospace, three columns per row.
 */
import { useAppStore } from '../../store/appStore';

function fixed(value: number | undefined, digits: number): string {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? numeric : 0).toFixed(digits);
}

export function Hud() {
  const focus = useAppStore((state) => state.focus);
  const viewing = useAppStore((state) => state.viewing);
  const camera = useAppStore((state) => state.camera);
  const nodes = useAppStore((state) => state.nodes);

  const target = focus ?? viewing;
  const node =
    target?.type === 'node' ? nodes.find((n) => String(n.id) === String(target.id)) : undefined;
  const position = camera?.position ?? [0, 0, 0];

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-20 flex w-64 flex-col gap-2">
      {target && (
        <div className="rounded-xl border border-orange-500/50 bg-slate-900/90 p-2.5 shadow-lg backdrop-blur-sm">
          <div className="mb-1 border-b border-orange-500/30 pb-1 text-[10px] font-bold tracking-wider text-orange-400 uppercase">
            <i className="fas fa-cube mr-1" aria-hidden="true" />Koordinat Objek
          </div>
          {node ? (
            <div className="grid grid-cols-3 gap-3 font-mono text-xs text-slate-200">
              <div>{fixed(node.posX, 2)}</div>
              <div>{fixed(node.posY, 2)}</div>
              <div>{fixed(node.posZ, 2)}</div>
            </div>
          ) : (
            <div className="font-mono text-xs text-slate-200">Garis</div>
          )}
        </div>
      )}
      <div className="rounded-xl border border-blue-500/50 bg-slate-900/90 p-2.5 shadow-lg backdrop-blur-sm">
        <div className="mb-1 border-b border-blue-500/30 pb-1 text-[10px] font-bold tracking-wider text-blue-400 uppercase">
          <i className="fas fa-video mr-1" aria-hidden="true" />Kamera (X Y Z)
        </div>
        <div className="grid grid-cols-3 gap-3 font-mono text-xs text-slate-200">
          <div>{fixed(position[0], 1)}</div>
          <div>{fixed(position[1], 1)}</div>
          <div>{fixed(position[2], 1)}</div>
        </div>
      </div>
    </div>
  );
}
