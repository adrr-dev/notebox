/**
 * Epistemic meaning editor for an edge.
 *
 * Ported from the legacy relation editor (markup L4519-4609, load
 * L8468-8549, preview L8520-8553, builder L5759-5789). The symbolic relation
 * select lives in `EditorModal`; this panel owns the *meaning* of the edge:
 * type, status, rationale, qualifier, optional custom label and extra sources.
 */
import { useMemo } from 'react';
import { buildEpistemicRelation } from '../epistemic/validate';
import { EPISTEMIC_SCHEMA_V2, EPISTEMIC_KIND_LABELS, EPISTEMIC_STATUS_LABELS } from '../epistemic/schemaV2.catalog';
import { useAppStore } from '../../store/appStore';
import type { EdgeRecord, EpistemicSourceRef } from '../../types/model';

export interface EdgeRelationDraft {
  type: string;
  status: string;
  rationale: string;
  qualifier: string;
  customLabel: string;
  sourceRefs: EpistemicSourceRef[];
}

/** An empty draft (no epistemic metadata yet). */
export const EMPTY_EDGE_RELATION: EdgeRelationDraft = {
  type: '',
  status: 'unreviewed',
  rationale: '',
  qualifier: '',
  customLabel: '',
  sourceRefs: [],
};

/** Draft initialized from a stored relation. */
export function edgeRelationToDraft(edge: EdgeRecord | null | undefined): EdgeRelationDraft {
  const relation = edge?.epistemicRelation;
  if (!relation || typeof relation !== 'object') return { ...EMPTY_EDGE_RELATION, sourceRefs: [] };
  return {
    type: typeof relation.type === 'string' ? relation.type : '',
    status: typeof relation.status === 'string' && relation.status ? relation.status : 'unreviewed',
    rationale: typeof relation.rationale === 'string' ? relation.rationale : '',
    qualifier: typeof relation.qualifier === 'string' ? relation.qualifier : '',
    customLabel: typeof relation.customLabel === 'string' ? relation.customLabel : '',
    sourceRefs: Array.isArray(relation.sourceRefs)
      ? relation.sourceRefs
          .filter((ref) => ref && ['node', 'edge'].includes(ref.type) && ref.id !== undefined && ref.id !== null)
          .map((ref) => ({ ...ref }))
      : [],
  };
}

export interface EdgeRelationPanelProps {
  edge: EdgeRecord;
  draft: EdgeRelationDraft;
  onChange: (patch: Partial<EdgeRelationDraft>) => void;
}

export function EdgeRelationPanel({ edge, draft, onChange }: EdgeRelationPanelProps) {
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const pushToast = useAppStore((state) => state.pushToast);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const source = nodes.find((node) => String(node.id) === String(edge.sourceId));
  const target = nodes.find((node) => String(node.id) === String(edge.targetId));

  /* Live issues reuse the same builder the save path uses, so the panel and the
     save guard can never disagree about what blocks a write. */
  const built = useMemo(() => {
    if (!draft.type) return { errors: [], warnings: [] };
    const result = buildEpistemicRelation(edge, draft, graph);
    return { errors: result.errors, warnings: result.warnings };
  }, [draft, edge, graph]);

  const kindLabel = (kind: unknown) =>
    (typeof kind === 'string' && EPISTEMIC_KIND_LABELS[kind as keyof typeof EPISTEMIC_KIND_LABELS]) || 'jenis belum ditetapkan';

  const descriptor = draft.type
    ? EPISTEMIC_SCHEMA_V2.relationTypes[draft.type as keyof typeof EPISTEMIC_SCHEMA_V2.relationTypes]
    : null;
  const description = !draft.type
    ? 'Tidak ada makna epistemik eksplisit. Simbol matematis/logika di atas tetap berdiri sendiri.'
    : descriptor
      ? descriptor.description
      : `Jenis relasi '${draft.type}' tidak dikenal katalog ini. Nilai tersimpan akan dipertahankan tanpa ditafsirkan.`;

  const refOptions = useMemo(() => {
    const entries: Array<{ type: 'node' | 'edge'; id: string | number; title: string; kind: string }> = [];
    for (const node of nodes) {
      entries.push({ type: 'node', id: node.id, title: node.title || `Node ${node.id}`, kind: String(node.kind ?? '') });
    }
    for (const item of edges) {
      if (String(item.id) === String(edge.id)) continue;
      entries.push({ type: 'edge', id: item.id, title: item.title || `Garis ${item.id}`, kind: 'edge' });
    }
    entries.sort((a, b) => String(a.title).localeCompare(String(b.title), 'id'));
    return entries;
  }, [nodes, edges, edge.id]);

  const refTitle = (ref: EpistemicSourceRef) => {
    if (ref.type === 'node') {
      const node = nodes.find((item) => String(item.id) === String(ref.id));
      if (node) return node.title || `Node ${ref.id}`;
    } else {
      const item = edges.find((candidate) => String(candidate.id) === String(ref.id));
      if (item) return item.title || `Garis ${ref.id}`;
    }
    return ref.titleSnapshot || `ID ${ref.id}`;
  };

  const inputClass = 'w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-violet-500';
  const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase text-slate-400';

  const addSourceRef = (raw: string) => {
    if (!raw) return;
    let parsed: { type?: string; id?: string | number };
    try {
      parsed = JSON.parse(raw) as { type?: string; id?: string | number };
    } catch {
      pushToast('Referensi sumber tidak dapat dibaca.', 'error');
      return;
    }
    if (!parsed || (parsed.type !== 'node' && parsed.type !== 'edge') || parsed.id === undefined || parsed.id === null) {
      pushToast('Referensi sumber tidak valid.', 'error');
      return;
    }
    if (parsed.type === 'edge' && String(parsed.id) === String(edge.id)) {
      pushToast('Garis tidak dapat merujuk dirinya sendiri sebagai sumber tambahan.', 'error');
      return;
    }
    if (draft.sourceRefs.some((ref) => ref.type === parsed.type && String(ref.id) === String(parsed.id))) {
      pushToast('Sumber tersebut sudah ditautkan.', 'error');
      return;
    }
    onChange({ sourceRefs: [...draft.sourceRefs, { type: parsed.type, id: parsed.id }] });
  };

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-violet-500/40 bg-violet-950/15 p-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-violet-200">
          <i className="fas fa-diagram-project mr-2" aria-hidden="true" />
          Makna Epistemik Relasi
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Field ini terpisah dari simbol logika/matematika di atas. Simbol di atas menyimpan notasi simbolik; pilihan di sini memberi
          interpretasi epistemik pada hubungan. Makna dibaca dari node sumber menuju node tujuan. Edge lama tetap tanpa makna epistemik sampai
          diklasifikasikan secara eksplisit.
        </p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
        Arah tetap: {source?.title || `Node ${edge.sourceId}`} [{kindLabel(source?.kind)}] →{' '}
        {target?.title || `Node ${edge.targetId}`} [{kindLabel(target?.kind)}]. Untuk membalik arah, buat atau ubah koneksi graf secara
        terpisah.
      </div>

      <div className="grid grid-cols-1 gap-2 text-[10px] leading-relaxed sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
          <strong className="mb-1 block text-slate-200">1 · Simbol / notasi</strong>
          <span className="text-slate-400">Notasi logika, matematika, atau relasi visual yang dipilih pada bagian atas.</span>
        </div>
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-2">
          <strong className="mb-1 block text-violet-200">2 · Makna epistemik</strong>
          <span className="text-slate-400">Jenis hubungan yang dimaksud, dibaca dari sumber ke tujuan.</span>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
          <strong className="mb-1 block text-slate-200">3 · Status penilaian</strong>
          <span className="text-slate-400">Catatan tentang tinjauan hubungan, bukan sertifikat kebenaran kedua objek.</span>
        </div>
      </div>

      <div>
        <label htmlFor="input-epistemic-relation-type" className={labelClass}>
          Jenis relasi epistemik
        </label>
        <select
          id="input-epistemic-relation-type"
          value={draft.type}
          onChange={(event) => onChange({ type: event.target.value })}
          className={inputClass}
        >
          <option value="">Tidak ditetapkan / hapus metadata epistemik</option>
          {Object.entries(EPISTEMIC_SCHEMA_V2.relationTypes).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label} · {value}
            </option>
          ))}
          {draft.type && !Object.hasOwn(EPISTEMIC_SCHEMA_V2.relationTypes, draft.type) && (
            <option value={draft.type}>Jenis tersimpan tidak dikenal · {draft.type}</option>
          )}
        </select>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{description}</p>
      </div>

      {draft.type === 'custom' && (
        <div>
          <label htmlFor="input-epistemic-relation-custom" className={labelClass}>
            Label relasi khusus *
          </label>
          <input
            id="input-epistemic-relation-custom"
            maxLength={240}
            value={draft.customLabel}
            onChange={(event) => onChange({ customLabel: event.target.value })}
            placeholder="Contoh: mengoreksi sebagian dari"
            className={inputClass}
          />
        </div>
      )}

      <div>
        <label htmlFor="input-epistemic-relation-status" className={labelClass}>
          Status penilaian relasi
        </label>
        <select
          id="input-epistemic-relation-status"
          value={draft.status}
          onChange={(event) => onChange({ status: event.target.value })}
          className={inputClass}
        >
          {Object.entries(EPISTEMIC_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {draft.status && !Object.hasOwn(EPISTEMIC_STATUS_LABELS, draft.status) && (
            <option value={draft.status}>Status tersimpan tidak dikenal · {draft.status}</option>
          )}
        </select>
        <p className="mt-1 text-[10px] text-slate-500">
          Status ini menilai hubungan antarnode, bukan otomatis menilai kebenaran node sumber atau tujuan.
        </p>
      </div>

      <div>
        <label htmlFor="input-epistemic-relation-rationale" className={labelClass}>
          Alasan menetapkan hubungan
        </label>
        <textarea
          id="input-epistemic-relation-rationale"
          rows={2}
          maxLength={8000}
          value={draft.rationale}
          onChange={(event) => onChange({ rationale: event.target.value })}
          placeholder="Mengapa relasi ini tepat? Pisahkan fakta yang diamati dari interpretasi."
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <label htmlFor="input-epistemic-relation-qualifier" className={labelClass}>
          Kondisi / batas hubungan
        </label>
        <textarea
          id="input-epistemic-relation-qualifier"
          rows={2}
          maxLength={4000}
          value={draft.qualifier}
          onChange={(event) => onChange({ qualifier: event.target.value })}
          placeholder="Dalam kondisi apa hubungan ini berlaku? Apa batasnya?"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <label htmlFor="input-epistemic-source-ref-option" className={labelClass}>
          Sumber tambahan untuk relasi (opsional)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            id="input-epistemic-source-ref-option"
            value=""
            onChange={(event) => {
              addSourceRef(event.target.value);
              event.target.value = '';
            }}
            className={`${inputClass} min-w-0 flex-1`}
          >
            <option value="">Pilih node atau garis sumber…</option>
            {refOptions.map((entry) => (
              <option key={`${entry.type}-${String(entry.id)}`} value={JSON.stringify({ type: entry.type, id: entry.id })}>
                {entry.type === 'node' ? 'Objek' : 'Garis'} · {entry.title}
                {entry.kind && entry.kind !== 'edge' ? ` (${kindLabel(entry.kind)})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {draft.sourceRefs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-2 text-[10px] italic text-slate-500">
              Belum ada sumber tambahan yang ditautkan.
            </p>
          ) : (
            draft.sourceRefs.map((ref, index) => (
              <div
                key={`${ref.type}-${String(ref.id)}`}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 break-words text-xs text-slate-200">
                  {ref.type === 'node' ? 'Objek' : 'Garis'}: {refTitle(ref)}
                  {ref.unresolved ? ' · belum terselesaikan' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ sourceRefs: draft.sourceRefs.filter((_, i) => i !== index) })}
                  aria-label={`Lepas sumber tambahan ${refTitle(ref)}`}
                  className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-900/40"
                >
                  Lepas
                </button>
              </div>
            ))
          )}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Sumber tambahan menjelaskan penetapan relasi. Referensi yang tidak tersedia dari ekspor sebagian ditampilkan sebagai belum
          terselesaikan dan tidak otomatis dihapus.
        </p>
      </div>

      {built.errors.length > 0 ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-red-500/50 bg-red-950/30 p-3 text-xs leading-relaxed text-red-200">
          <p className="mb-1 font-bold">Perbaiki masalah skema sebelum menyimpan</p>
          {built.errors.map((issue) => (
            <p key={issue.code + issue.path}>• {issue.message}</p>
          ))}
        </div>
      ) : built.warnings.length > 0 ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">
          <p className="mb-1 font-bold">Periksa kesesuaian semantik</p>
          {built.warnings.map((issue) => (
            <p key={issue.code + issue.path}>• {issue.message}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
