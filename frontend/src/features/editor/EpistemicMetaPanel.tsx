/**
 * Epistemic metadata panel for nodes.
 *
 * Ported from the legacy edit pane (markup L3733-3800, load L8300-8310,
 * defaults L8359-8366): knowledge kind, epistemic status, and the optional
 * scope/assumptions/limitations/provenance block behind a `<details>`.
 */
import { useId, useState } from 'react';
import { EPISTEMIC_KIND_LABELS, EPISTEMIC_STATUS_LABELS } from '../epistemic/schemaV2.catalog';

export interface EpistemicMetaValues {
  kind: string;
  epistemicStatus: string;
  scope: string;
  assumptions: string;
  limitations: string;
  provenance: string;
}

export interface EpistemicMetaPanelProps {
  value: EpistemicMetaValues;
  onChange: (patch: Partial<EpistemicMetaValues>) => void;
}

/** Stored values that leave the catalog are kept, not silently rewritten. */
function withStoredOption(options: Record<string, string>, current: string): Array<[string, string]> {
  const entries = Object.entries(options);
  if (current && !Object.hasOwn(options, current)) entries.unshift([current, `Nilai tersimpan tidak dikenal · ${current}`]);
  return entries;
}

export function EpistemicMetaPanel({ value, onChange }: EpistemicMetaPanelProps) {
  const fieldId = useId();
  const [detailsOpen, setDetailsOpen] = useState(
    () => Boolean(value.scope || value.assumptions || value.limitations || value.provenance),
  );

  const inputClass =
    'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-500';

  return (
    <section className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-950/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-300">
          <i className="fas fa-scale-balanced" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-violet-200">Metadata epistemik</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Nyatakan jenis informasi dan status penilaiannya. Ini adalah metadata yang dicatat pengguna, bukan penilaian otomatis tentang
            kebenaran atau pemahaman.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fieldId}-kind`} className="mb-1.5 block text-xs font-bold text-slate-400">
            Jenis pengetahuan
          </label>
          <select
            id={`${fieldId}-kind`}
            value={value.kind}
            onChange={(event) => onChange({ kind: event.target.value })}
            className={inputClass}
          >
            {withStoredOption(EPISTEMIC_KIND_LABELS, value.kind).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-status`} className="mb-1.5 block text-xs font-bold text-slate-400">
            Status epistemik
          </label>
          <select
            id={`${fieldId}-status`}
            value={value.epistemicStatus}
            onChange={(event) => onChange({ epistemicStatus: event.target.value })}
            className={inputClass}
          >
            {withStoredOption(EPISTEMIC_STATUS_LABELS, value.epistemicStatus).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Status “Didukung bukti” masih merupakan label yang dipilih pengguna. Penautan bukti terstruktur dan audit sumber belum menjadi
        bagian dari antarmuka tahap ini.
      </p>

      <details
        className="border-t border-violet-500/20 pt-3"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer select-none text-xs font-bold text-slate-300 hover:text-white">
          Ruang lingkup, asumsi, batas, dan asal-usul (opsional)
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`${fieldId}-scope`} className="mb-1.5 block text-xs font-bold text-slate-400">
              Ruang lingkup
            </label>
            <input
              id={`${fieldId}-scope`}
              type="text"
              maxLength={500}
              value={value.scope}
              onChange={(event) => onChange({ scope: event.target.value })}
              placeholder="Kondisi atau konteks tempat klaim berlaku"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-assumptions`} className="mb-1.5 block text-xs font-bold text-slate-400">
              Asumsi
            </label>
            <textarea
              id={`${fieldId}-assumptions`}
              rows={2}
              maxLength={5000}
              value={value.assumptions}
              onChange={(event) => onChange({ assumptions: event.target.value })}
              placeholder="Apa yang dianggap benar, tetapi belum dipastikan?"
              className={`${inputClass} resize-y`}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-limitations`} className="mb-1.5 block text-xs font-bold text-slate-400">
              Batas dan ketidakpastian
            </label>
            <textarea
              id={`${fieldId}-limitations`}
              rows={2}
              maxLength={5000}
              value={value.limitations}
              onChange={(event) => onChange({ limitations: event.target.value })}
              placeholder="Apa yang belum diketahui atau belum boleh disimpulkan?"
              className={`${inputClass} resize-y`}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-provenance`} className="mb-1.5 block text-xs font-bold text-slate-400">
              Asal-usul informasi
            </label>
            <textarea
              id={`${fieldId}-provenance`}
              rows={2}
              maxLength={5000}
              value={value.provenance}
              onChange={(event) => onChange({ provenance: event.target.value })}
              placeholder="Dari mana atau melalui proses apa informasi ini diperoleh? Referensi bukti terstruktur akan ditambahkan pada tahap berikutnya."
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>
      </details>
    </section>
  );
}
