/**
 * "Variabel Global & Ketergantungan State" panel.
 *
 * Read-only view of the state engine: which variables exist, which objects
 * define/read them, unfinished dependencies and the variables flowing through
 * each edge. Ported from the legacy modal (markup L5383-5437, render L7968-8237),
 * minus the manual "Hitung Ulang Semua" button — recalculation is automatic now.
 */
import { useMemo } from 'react';
import { Modal } from '../../ui/Modal';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { formatMathNumber } from './evaluate';
import { useFormulaStore } from './formulaStore';

interface RefChipProps {
  type: 'node' | 'edge';
  title: string;
  tone: 'def' | 'dep';
}

/** Owner chip: node/edge icon + title (legacy `.var-chip-def` / `.var-chip-dep`). */
function RefChip({ type, title, tone }: RefChipProps) {
  return (
    <span className={`var-chip ${tone === 'def' ? 'var-chip-def' : 'var-chip-dep'}`}>
      <i className={`fas ${type === 'node' ? 'fa-cube' : 'fa-diagram-project'} mr-1`} aria-hidden="true" />
      {title}
    </span>
  );
}

export function GlobalVarsModal() {
  const open = useUiStore((state) => state.globalVarsOpen);
  const close = useUiStore((state) => state.close);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const engine = useFormulaStore((state) => state.state);

  // `node:12` / `edge:edge_3` -> title, used to resolve definers and dependents.
  const refs = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) map.set(`node:${node.id}`, node.title);
    for (const edge of edges) map.set(`edge:${edge.id}`, edge.title);
    return map;
  }, [nodes, edges]);

  return (
    <Modal
      open={open}
      onClose={() => close('globalVars')}
      widthClass="max-w-3xl"
      title={
        <>
          <i className="fas fa-share-nodes mr-2 text-amber-400" aria-hidden="true" />
          Variabel Global &amp; Ketergantungan State
        </>
      }
    >
      <p className="text-[11px] leading-relaxed text-slate-400">
        Setiap objek/garis dapat mendefinisikan variabel lewat kolom <b>Ekspresi Math</b> (klik ikon{' '}
        <i className="fas fa-calculator text-green-400" aria-hidden="true" /> di editor) dengan format{' '}
        <code className="rounded bg-slate-900 px-1">nama = nilai</code>. Objek lain yang{' '}
        <b>terhubung dengan garis</b> dapat memanggil variabel tersebut untuk diproses lebih lanjut — mirip sel pada
        spreadsheet yang saling merujuk. Perhitungan ulang berjalan otomatis setiap kali ekspresi atau hubungan
        berubah; panel ini hanya untuk membaca.
      </p>

      <div className="mt-4 max-h-[68vh] space-y-6 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-3 text-xs font-bold tracking-widest text-emerald-400 uppercase">
            <i className="fas fa-database mr-2" aria-hidden="true" />
            Variabel global
          </h3>
          {engine.globalList.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-500 italic">
              Belum ada variabel yang didefinisikan. Isi <b>Ekspresi Math</b> sebuah objek dengan format{' '}
              <code className="rounded bg-slate-900 px-1">nama = nilai</code> untuk memulai.
            </div>
          ) : (
            <div className="space-y-3">
              {engine.globalList.map((variable) => (
                <div key={variable.varName} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg font-bold text-cyan-300">{variable.varName}</span>
                    <span className="font-mono text-sm text-slate-400">
                      = {formatMathNumber(variable.definers[0].value)}
                    </span>
                    {variable.definers.length > 1 && (
                      <span
                        className="rounded-full border border-red-700/50 bg-red-900/40 px-2 py-0.5 text-[10px] font-bold text-red-400"
                        title="Variabel ini didefinisikan lebih dari satu objek. Nilai akhir mengikuti perhitungan pass terakhir."
                      >
                        <i className="fas fa-triangle-exclamation mr-1" aria-hidden="true" />
                        Konflik Nama
                      </span>
                    )}
                  </div>
                  <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Didefinisikan oleh
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {variable.definers.map((definer) => {
                      const key = `${definer.ownerType}:${definer.ownerId}`;
                      return (
                        <RefChip
                          key={key}
                          type={definer.ownerType}
                          title={refs.get(key) ?? '?'}
                          tone="def"
                        />
                      );
                    })}
                  </div>
                  <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Digunakan oleh
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {variable.dependents.length === 0 ? (
                      <span className="text-xs text-slate-500 italic">Belum dipakai objek lain</span>
                    ) : (
                      variable.dependents.map((key) => (
                        <RefChip
                          key={key}
                          type={key.startsWith('edge:') ? 'edge' : 'node'}
                          title={refs.get(key) ?? '?'}
                          tone="dep"
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold tracking-widest text-amber-400 uppercase">
            <i className="fas fa-triangle-exclamation mr-2" aria-hidden="true" />
            Dependensi belum selesai
          </h3>
          {engine.unresolvedList.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-500 italic">
              Tidak ada ketergantungan bermasalah. Semua variabel yang dipanggil berhasil ditemukan.
            </div>
          ) : (
            <div className="space-y-2">
              {engine.unresolvedList.map((dependency, index) => (
                <div
                  key={`${dependency.type}:${dependency.id}:${dependency.varName}:${index}`}
                  className="flex items-start gap-3 rounded-xl border border-amber-700/40 bg-amber-950/30 p-3"
                >
                  <i className="fas fa-triangle-exclamation mt-0.5 text-amber-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-white">
                      <RefChip type={dependency.type} title={dependency.title} tone="dep" />
                      <span>
                        membutuhkan <span className="font-mono text-amber-300">{dependency.varName}</span>
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {dependency.existsElsewhere
                        ? 'Variabel ini didefinisikan di objek lain, tapi belum terhubung langsung dengan garis ke objek ini. Hubungkan keduanya agar nilainya bisa dipakai.'
                        : `Variabel ini belum didefinisikan di objek manapun. Periksa penulisannya, atau definisikan dulu di salah satu objek (format: ${dependency.varName} = nilai).`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold tracking-widest text-cyan-400 uppercase">
            <i className="fas fa-arrow-right-arrow-left mr-2" aria-hidden="true" />
            Aliran variabel per garis
          </h3>
          {Object.keys(engine.edgeFlow).length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-500 italic">
              Belum ada variabel yang mengalir melalui garis. Hubungkan objek yang mendefinisikan variabel ke objek
              yang memakainya.
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(engine.edgeFlow).map(([edgeId, names]) => (
                <div key={edgeId} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <RefChip type="edge" title={refs.get(`edge:${edgeId}`) ?? `Garis ${edgeId}`} tone="dep" />
                    <span className="text-xs text-slate-400">mengalirkan</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {names.map((name) => (
                      <span key={name} className="var-chip var-chip-def">
                        <i className="fas fa-right-left mr-1" aria-hidden="true" />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
