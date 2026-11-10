/**
 * Ekspor, Impor & Bagikan.
 *
 * Port dari panel data I/O versi lama (markup L13231-13364, logika
 * L13365-14571). Perbedaan yang disengaja: validasi berat, migrasi model
 * pengetahuan dan pemetaan ID kini dikerjakan server Go; panel ini melakukan
 * preflight baca-saja lalu menampilkan masalah validasi server apa adanya.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../api/client';
import { ApiError } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { Modal } from '../../ui/Modal';
import type {
  ApiIssue,
  EdgeRecord,
  EntityID,
  ImportOutcome,
  NodeRecord,
  SnapshotSummary,
  WorkspaceEnvelope,
} from '../../types/model';
import { buildMarkdownSummary } from './markdownSummary';

const APP_FORMAT = 'ruang-informasi-3d';
/** Envelope layout version, unchanged from the legacy app (L13412). */
const FORMAT_VERSION = 1;
/** Defence against accidental multi-hundred-MiB files (legacy L14388). */
const MAX_WORKSPACE_IMPORT_BYTES = 64 * 1024 * 1024;

const SCOPE_HELP =
  'Ekspor penuh: kosongkan semua centang pada daftar, lalu tekan Ekspor JSON. Tombol “Semua objek/garis” menandai item sebagai pilihan, sehingga hasil tetap berstatus ekspor pilihan meskipun semua node/garis tertandai. Ekspor pilihan bukan cadangan lengkap: ia tidak membawa seluruh sampah, riwayat epistemik, episode belajar, siklus tindakan, status kamera, atau tur. Ringkasan Markdown adalah laporan baca, bukan berkas pemulihan.';

const PLACEMENT_LABELS: Array<{ value: api.ImportParams['rule']; label: string }> = [
  { value: 'original', label: 'Posisi asli (sesuai berkas)' },
  { value: 'offset', label: 'Geser dengan offset X / Y / Z' },
  { value: 'origin', label: 'Pusatkan di titik asal (X & Z = 0)' },
  { value: 'camera', label: 'Letakkan di depan kamera' },
  { value: 'grid', label: 'Susun otomatis dalam grid' },
];

/** `ruang-informasi-3d_{semua|pilihan}_{YYYYMMDD-HHmm}.json` (legacy L13445). */
function stamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Dates in the recovery-point list use the Indonesian locale. */
function formatWhen(value: number | string | null | undefined): string {
  if (value === undefined || value === null || value === '') return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID');
}

function download(name: string, text: string, mime: string): void {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type: mime }));
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1500);
}

/** Clipboard write with the legacy `execCommand` fallback (L14317). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** Checklist identity: objects and relations live in one flat list. */
function selectionKey(kind: 'n' | 'e', id: EntityID): string {
  return `${kind}:${id}`;
}

/** Read-only facts the preflight panel shows before anything is mutated. */
interface EnvelopeFacts {
  scope: 'all' | 'selection' | 'unknown';
  nodes: number;
  edges: number;
  trash: number;
  history: number;
  episodes: number;
  cycles: number;
  sourceModelVersion: number;
}

interface ParsedImport {
  fileName: string;
  sizeMiB: number;
  envelope: WorkspaceEnvelope;
  facts: EnvelopeFacts;
}

/** Describes an incoming envelope without touching the active workspace. */
function describeEnvelope(envelope: WorkspaceEnvelope): EnvelopeFacts {
  const length = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return {
    scope: envelope.scope === 'all' ? 'all' : envelope.scope === 'selection' ? 'selection' : 'unknown',
    nodes: length(envelope.nodes),
    edges: length(envelope.edges),
    trash: length(envelope.trash),
    history: length(envelope.epistemicHistory),
    episodes: length(envelope.learningEpisodes),
    cycles: length(envelope.actionCycles),
    sourceModelVersion: Number(envelope.knowledgeModelVersion ?? 1),
  };
}

/** The downloaded envelope plus the counts the success toast reports. */
interface ExportBundle {
  envelope: WorkspaceEnvelope;
  all: boolean;
  nodes: number;
  edges: number;
}

function scopeLabel(scope: EnvelopeFacts['scope']): string {
  if (scope === 'all') return 'seluruh workspace';
  if (scope === 'selection') return 'ekspor pilihan (parsial)';
  return 'tidak dinyatakan oleh berkas';
}

/** Rejects anything that is not a JSON object carrying a `nodes` array. */
function parseEnvelope(text: string): WorkspaceEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Berkas bukan JSON yang valid.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as WorkspaceEnvelope).nodes)) {
    throw new Error('Format berkas tidak dikenali.');
  }
  return parsed as WorkspaceEnvelope;
}

export function DataIOModal() {
  const dataIoOpen = useUiStore((state) => state.dataIoOpen);
  const close = useUiStore((state) => state.close);

  const workspaceId = useAppStore((state) => state.workspaceId);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const knowledgeModelVersion = useAppStore((state) => state.knowledgeModelVersion);
  const knowledgeCount = useAppStore(
    (state) => state.epistemicHistory.length + state.learningEpisodes.length + state.actionCycles.length,
  );
  const applyWorkspace = useAppStore((state) => state.applyWorkspace);
  const applyGraphPayload = useAppStore((state) => state.applyGraphPayload);
  const saveNow = useAppStore((state) => state.saveNow);
  const snapshotNow = useAppStore((state) => state.snapshotNow);
  const pushToast = useAppStore((state) => state.pushToast);

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [filter, setFilter] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [mode, setMode] = useState<api.ImportParams['mode']>('merge');
  const [rule, setRule] = useState<api.ImportParams['rule']>('original');
  const [offset, setOffset] = useState({ dx: '0', dy: '0', dz: '0' });
  const [avoid, setAvoid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [issues, setIssues] = useState<ApiIssue[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSnapshots = useCallback(async () => {
    if (workspaceId === null) return;
    try {
      setSnapshots(await api.listSnapshots(workspaceId));
    } catch (error) {
      setSnapshots([]);
      pushToast(`Gagal memuat snapshot: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [workspaceId, pushToast]);

  useEffect(() => {
    if (!dataIoOpen) return;
    // Reopening the panel starts from a clean slate (legacy openDlg, L14332).
    setSelected(new Set());
    setFilter('');
    setParsed(null);
    setReadError(null);
    setResult(null);
    setIssues([]);
    setMode('merge');
    setRule('original');
    setOffset({ dx: '0', dy: '0', dz: '0' });
    setAvoid(true);
    if (fileRef.current) fileRef.current.value = '';
    void refreshSnapshots();
  }, [dataIoOpen, refreshSnapshots]);

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list: Array<{ kind: 'n' | 'e'; id: EntityID; title: string }> = [
      ...nodes.map((node) => ({ kind: 'n' as const, id: node.id, title: String(node.title || 'Tanpa Judul') })),
      ...edges.map((edge) => ({ kind: 'e' as const, id: edge.id, title: String(edge.title || 'Koneksi Baru') })),
    ];
    if (!query) return list;
    return list.filter((row) => row.title.toLowerCase().includes(query));
  }, [nodes, edges, filter]);

  /** One explicit branch per axis keeps the state shape statically known. */
  const setOffsetAxis = (axis: 'dx' | 'dy' | 'dz', value: string) => {
    setOffset((current) => {
      if (axis === 'dx') return { ...current, dx: value };
      if (axis === 'dy') return { ...current, dy: value };
      return { ...current, dz: value };
    });
  };

  const toggleRow = (kind: 'n' | 'e', id: EntityID) => {
    setSelected((current) => {
      const next = new Set(current);
      const key = selectionKey(kind, id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Selection scope (legacy `pick()`, L13401): an empty checklist means the
   * whole workspace; otherwise checked objects plus checked relations, and a
   * checked relation always pulls both of its endpoints along so the exported
   * file never carries a dangling edge.
   */
  const pick = useCallback((): { all: boolean; nodes: NodeRecord[]; edges: EdgeRecord[] } => {
    if (selected.size === 0) return { all: true, nodes, edges };
    const ids = new Set(nodes.filter((node) => selected.has(selectionKey('n', node.id))).map((node) => String(node.id)));
    const pickedEdges = edges.filter(
      (edge) =>
        selected.has(selectionKey('e', edge.id)) ||
        (ids.has(String(edge.sourceId)) && ids.has(String(edge.targetId))),
    );
    for (const edge of pickedEdges) {
      ids.add(String(edge.sourceId));
      ids.add(String(edge.targetId));
    }
    return { all: false, nodes: nodes.filter((node) => ids.has(String(node.id))), edges: pickedEdges };
  }, [selected, nodes, edges]);

  /** Resolves the envelope for the current checklist (server export when full). */
  const resolveExport = useCallback(async (): Promise<ExportBundle | null> => {
    const picked = pick();
    if (picked.all) {
      if (workspaceId === null) {
        pushToast('Workspace belum siap; tunggu pemuatan selesai.', 'error');
        return null;
      }
      return { envelope: await api.fetchExport(workspaceId), all: true, nodes: picked.nodes.length, edges: picked.edges.length };
    }
    if (picked.nodes.length === 0 && picked.edges.length === 0) {
      pushToast(
        'Ekspor pilihan dibatalkan: tidak ada objek atau garis terpilih yang masih tersedia. Pilih objek aktif atau kosongkan pilihan untuk mengekspor seluruh workspace.',
        'error',
      );
      return null;
    }
    return {
      envelope: {
        app: APP_FORMAT,
        version: 1, // dipertahankan untuk kompatibilitas format lama (L13412)
        formatVersion: FORMAT_VERSION,
        knowledgeModelVersion,
        exportedAt: new Date().toISOString(),
        scope: 'selection',
        nodes: picked.nodes,
        edges: picked.edges,
      },
      all: false,
      nodes: picked.nodes.length,
      edges: picked.edges.length,
    };
  }, [pick, workspaceId, knowledgeModelVersion, pushToast]);

  const handleExport = async () => {
    try {
      const bundle = await resolveExport();
      if (!bundle) return;
      download(
        `ruang-informasi-3d_${bundle.all ? 'semua' : 'pilihan'}_${stamp()}.json`,
        JSON.stringify(bundle.envelope, null, 2),
        'application/json',
      );
      // Selection exports never carry the knowledge collections, trash, camera
      // or tour; say so instead of letting the file look like a full backup.
      const notice = bundle.all
        ? ''
        : ` Ekspor pilihan hanya berisi objek/garis terpilih beserta lampirannya; histori pengetahuan${
            knowledgeCount ? ` (${knowledgeCount} catatan)` : ''
          }, tempat sampah, kamera, dan tur tidak disertakan. Gunakan ekspor workspace penuh untuk cadangan lengkap.`;
      pushToast(`Ekspor berhasil: ${bundle.nodes} objek, ${bundle.edges} garis.${notice}`, 'success');
    } catch (error) {
      pushToast(`Ekspor gagal: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleMarkdown = () => {
    const picked = pick();
    download(
      `ringkasan_ruang-informasi-3d_${stamp()}.md`,
      buildMarkdownSummary(picked.nodes, picked.edges),
      'text/markdown',
    );
    pushToast('Ringkasan diunduh.', 'success');
  };

  const handleCopyJson = async () => {
    try {
      const bundle = await resolveExport();
      if (!bundle) return;
      const ok = await copyText(JSON.stringify(bundle.envelope, null, 2));
      pushToast(ok ? 'JSON ekspor disalin ke papan klip.' : 'Gagal menyalin otomatis; salin manual dari berkas ekspor.', ok ? 'success' : 'error');
    } catch (error) {
      pushToast(`Gagal menyiapkan JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleShare = async () => {
    const picked = pick();
    const text = buildMarkdownSummary(picked.nodes, picked.edges);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Ruang Informasi 3D', text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const ok = await copyText(text);
    pushToast(
      ok
        ? 'Berbagi langsung tidak didukung — ringkasan disalin ke papan klip.'
        : 'Berbagi langsung tidak didukung dan penyalinan otomatis gagal.',
      ok ? 'info' : 'error',
    );
  };

  const handleFile = async (file: File | undefined) => {
    setResult(null);
    setIssues([]);
    setParsed(null);
    setReadError(null);
    if (!file) return;
    if (file.size > MAX_WORKSPACE_IMPORT_BYTES) {
      const message = `Berkas workspace terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MiB). Batas impor lokal ${
        MAX_WORKSPACE_IMPORT_BYTES / (1024 * 1024)
      } MiB; pecah lampiran atau impor melalui workspace lebih kecil.`;
      setReadError(message);
      pushToast(message, 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    try {
      const envelope = parseEnvelope(await file.text());
      setParsed({ fileName: file.name, sizeMiB: file.size / (1024 * 1024), envelope, facts: describeEnvelope(envelope) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Berkas gagal dibaca.';
      setReadError(`${message} Workspace aktif tidak diubah.`);
      pushToast(`Impor gagal: ${message}`, 'error');
    }
  };

  const importWarnings = useMemo(() => {
    if (!parsed) return [] as string[];
    const { facts } = parsed;
    const warnings: string[] = [];
    if (facts.scope === 'selection') {
      warnings.push(
        'PERHATIAN: ekspor pilihan bukan cadangan lengkap. Data workspace yang tidak disertakan oleh berkas tidak dapat dipulihkan dari impor ini.',
      );
    }
    if (facts.scope === 'unknown') {
      warnings.push(
        'PERHATIAN: berkas tidak mencantumkan cakupan. Jangan menganggapnya sebagai cadangan lengkap tanpa memeriksa sumbernya.',
      );
    }
    if (facts.sourceModelVersion < 2) {
      warnings.push(
        `Model pengetahuan sumber V${facts.sourceModelVersion} akan dimigrasikan ke V2; relasi lama dipertahankan tanpa menebak makna epistemiknya.`,
      );
    }
    const knowledge = facts.history + facts.episodes + facts.cycles;
    if (knowledge > 0) {
      warnings.push(
        `Berkas memuat catatan pengetahuan (${facts.history} riwayat epistemik, ${facts.episodes} episode belajar, ${facts.cycles} siklus tindakan); mode Gabung menolaknya, gunakan mode Ganti.`,
      );
    }
    if (mode === 'merge') {
      warnings.push(
        'Mode Gabung memberi ID baru pada setiap objek dan garis yang diimpor (remap); rujukan silang di dalam berkas dipetakan ulang ke ID baru tersebut.',
      );
    }
    return warnings;
  }, [parsed, mode]);

  const confirmMessage = (file: ParsedImport): string => {
    const { facts } = file;
    if (mode === 'replace') {
      return [
        'GANTI seluruh workspace aktif dengan berkas tervalidasi ini?',
        `Berkas: ${file.fileName}; cakupan: ${scopeLabel(facts.scope)}.`,
        `Data masuk: ${facts.nodes} objek, ${facts.edges} garis, ${facts.trash} item sampah, ${facts.history} riwayat epistemik, ${facts.episodes} episode belajar, ${facts.cycles} siklus tindakan.`,
        `Workspace saat ini memiliki ${nodes.length} objek, ${edges.length} garis. Data graf dan koleksi pengetahuan aktif akan diganti sesuai isi berkas.`,
        facts.scope === 'all' ? '' : 'Berkas tidak terbukti sebagai ekspor workspace penuh; sejumlah data dapat tidak tersedia.',
        'Pastikan sudah memiliki cadangan JSON penuh yang terpisah. Lanjutkan?',
      ]
        .filter(Boolean)
        .join('\n');
    }
    return [
      'GABUNG data dari berkas tervalidasi ini ke workspace aktif?',
      `Berkas: ${file.fileName}; cakupan: ${scopeLabel(facts.scope)}.`,
      `Data masuk: ${facts.nodes} objek, ${facts.edges} garis, ${facts.trash} item sampah. Konflik ID mungkin menghasilkan ID baru; posisi objek mengikuti aturan penempatan yang dipilih.`,
      'Riwayat epistemik, episode belajar, dan siklus tindakan dari berkas tidak digabungkan oleh mode ini.',
      'Lanjutkan?',
    ].join('\n');
  };

  const outcomeMessage = (outcome: ImportOutcome): string => {
    let message = `Impor selesai: ${outcome.addedNodes} objek, ${outcome.addedEdges} garis${
      outcome.remapped ? ', sebagian diberi ID baru' : ''
    }.`;
    if (outcome.migratedFromKnowledgeModelVersion) {
      message += ` Model pengetahuan dimigrasikan dari V${outcome.migratedFromKnowledgeModelVersion} ke V${
        outcome.knowledgeModelVersion ?? 2
      }; relasi lama dipertahankan tanpa menebak makna epistemiknya.`;
    }
    if (outcome.warnings && outcome.warnings.length > 0) {
      message += ` ${outcome.warnings.length} peringatan dari server: ${outcome.warnings.join(' ')}`;
    }
    return message;
  };

  const handleImport = async () => {
    if (busy) {
      pushToast('Impor sedang diproses. Tunggu hasil validasi saat ini.', 'info');
      return;
    }
    if (parsed === null) {
      pushToast('Pilih berkas .json terlebih dahulu.', 'error');
      return;
    }
    if (workspaceId === null) {
      pushToast('Workspace belum siap; tunggu pemuatan selesai.', 'error');
      return;
    }
    const confirmed = await confirmDialog({
      title: mode === 'replace' ? 'Ganti workspace aktif?' : 'Gabungkan data?',
      message: confirmMessage(parsed),
      confirmText: mode === 'replace' ? 'Ganti workspace' : 'Gabungkan data',
      tone: 'warning',
    });
    if (!confirmed) {
      pushToast('Impor dibatalkan; workspace aktif tidak diubah.', 'info');
      return;
    }
    setBusy(true);
    setIssues([]);
    setResult(null);
    try {
      const outcome = await api.importEnvelope(workspaceId, parsed.envelope, {
        mode,
        rule,
        dx: Number(offset.dx) || 0,
        dy: Number(offset.dy) || 0,
        dz: Number(offset.dz) || 0,
        avoid,
      });
      applyWorkspace(await api.getWorkspace(workspaceId));
      const message = outcomeMessage(outcome);
      setResult(message);
      pushToast(message, 'success');
      setParsed(null);
      setSelected(new Set());
      if (fileRef.current) fileRef.current.value = '';
      await refreshSnapshots();
    } catch (error) {
      const message = `${error instanceof Error ? error.message : 'Kesalahan tidak diketahui'}. Workspace aktif tidak diubah jika validasi gagal; periksa pesan dan berkas sumber.`;
      setResult(`Validasi atau impor gagal: ${message}`);
      setIssues(error instanceof ApiError ? error.issues : []);
      pushToast(`Impor gagal: ${error instanceof Error ? error.message : 'kesalahan tidak diketahui'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSnapshot = async () => {
    await snapshotNow('manual');
    await refreshSnapshots();
  };

  const handleRestore = async (snapshot: SnapshotSummary) => {
    if (workspaceId === null) return;
    const confirmed = await confirmDialog({
      title: 'Pulihkan snapshot?',
      message: `Pulihkan workspace ke snapshot "${snapshot.reason}" (${formatWhen(snapshot.savedAt)})? Isi graf saat ini akan diganti oleh isi snapshot.`,
      confirmText: 'Pulihkan',
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      const payload = await api.getSnapshotPayload(workspaceId, snapshot.id);
      // A restore is exact: absent collections are cleared, not inherited.
      applyGraphPayload({
        knowledgeModelVersion: payload.knowledgeModelVersion ?? 2,
        nodes: payload.nodes ?? [],
        edges: payload.edges ?? [],
        trash: payload.trash ?? [],
        epistemicHistory: payload.epistemicHistory ?? [],
        learningEpisodes: payload.learningEpisodes ?? [],
        actionCycles: payload.actionCycles ?? [],
        camera: payload.camera ?? null,
        tour: payload.tour ?? null,
        fase2: payload.fase2 ?? null,
      });
      await saveNow('restore-snapshot');
      pushToast(`Snapshot "${snapshot.reason}" dipulihkan ke workspace.`, 'success');
      await refreshSnapshots();
    } catch (error) {
      pushToast(`Gagal memulihkan snapshot: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleDeleteSnapshot = async (snapshot: SnapshotSummary) => {
    if (workspaceId === null) return;
    const confirmed = await confirmDialog({
      title: 'Hapus snapshot?',
      message: `Hapus snapshot "${snapshot.reason}" (${formatWhen(snapshot.savedAt)})? Titik pemulihan ini akan hilang permanen.`,
      confirmText: 'Hapus',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteSnapshot(workspaceId, snapshot.id);
      pushToast('Snapshot dihapus.', 'success');
      await refreshSnapshots();
    } catch (error) {
      pushToast(`Gagal menghapus snapshot: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const countLabel = selected.size
    ? `${selected.size} dipilih`
    : `Tidak ada yang dicentang → seluruh data (${nodes.length} objek, ${edges.length} garis)`;

  return (
    <Modal
      open={dataIoOpen}
      onClose={() => close('dataIo')}
      title={
        <>
          <i className="fas fa-file-export mr-2 text-emerald-400" aria-hidden="true" />
          Ekspor, Impor &amp; Bagikan
        </>
      }
      widthClass="max-w-4xl"
    >
      <div id="dio-scope-help" className="mb-4 pr-8 text-xs leading-relaxed text-slate-400">
        {SCOPE_HELP}
      </div>

      <section aria-labelledby="dio-export-heading">
        <h3 id="dio-export-heading" className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
          Ekspor
        </h3>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span id="dio-count" role="status" aria-live="polite" className="text-[11px] font-bold text-emerald-300">
            {countLabel}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Pilih semua objek dan garis; ekspor akan berupa subset pilihan"
              title="Menandai semua objek/garis sebagai pilihan, bukan ekspor workspace penuh"
              onClick={() =>
                setSelected(new Set([...nodes.map((node) => selectionKey('n', node.id)), ...edges.map((edge) => selectionKey('e', edge.id))]))
              }
              className="rounded-lg bg-slate-700 px-3 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
            >
              Semua objek/garis
            </button>
            <button
              type="button"
              aria-label="Kosongkan pilihan; tombol Ekspor JSON kemudian mencakup seluruh workspace"
              title="Tindakan ini hanya mengosongkan pilihan. Setelah itu tekan Ekspor JSON untuk membuat ekspor workspace penuh."
              onClick={() => setSelected(new Set())}
              className="rounded-lg bg-slate-700 px-3 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
            >
              Kosongkan pilihan
            </button>
          </div>
        </div>

        <label className="sr-only" htmlFor="dio-filter">
          Cari objek atau garis
        </label>
        <div className="relative mb-2">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <i className="fas fa-search text-xs text-slate-500" aria-hidden="true" />
          </span>
          <input
            id="dio-filter"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Cari objek atau garis…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        <div
          id="dio-list"
          className="max-h-[30vh] min-h-[110px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/40 p-1"
        >
          {rows.length === 0 ? (
            <div className="p-5 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
              {filter ? 'Tidak ada objek atau garis yang cocok.' : 'Belum ada data.'}
            </div>
          ) : (
            rows.map((row) => {
              const key = selectionKey(row.kind, row.id);
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-700/60"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-emerald-500"
                    checked={selected.has(key)}
                    onChange={() => toggleRow(row.kind, row.id)}
                  />
                  <i
                    className={`fas ${row.kind === 'n' ? 'fa-cube text-blue-400' : 'fa-project-diagram text-orange-400'} w-4 text-center`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-sm text-white">{row.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{row.kind === 'n' ? 'Objek' : 'Garis'}</span>
                </label>
              );
            })
          )}
        </div>

        <div className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Simpan &amp; Bagikan</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-600"
          >
            <i className="fas fa-download" aria-hidden="true" /> Ekspor JSON
          </button>
          <button
            type="button"
            onClick={handleMarkdown}
            title="Laporan baca Markdown, bukan berkas pemulihan"
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-600"
          >
            <i className="fas fa-file-alt" aria-hidden="true" /> Ringkasan Markdown
          </button>
          <button
            type="button"
            onClick={() => void handleCopyJson()}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-600"
          >
            <i className="fas fa-copy" aria-hidden="true" /> Salin JSON
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
          >
            <i className="fas fa-share-alt" aria-hidden="true" /> Bagikan
          </button>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="dio-import-heading">
        <h3 id="dio-import-heading" className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Impor dari berkas JSON
        </h3>
        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
          <label className="text-[11px] font-bold uppercase text-slate-400" htmlFor="dio-file">
            Berkas JSON
          </label>
          <input
            id="dio-file"
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            className="text-xs text-slate-300 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:font-bold file:text-white"
          />

          <div
            id="dio-import-preview"
            role="status"
            aria-live="polite"
            className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-2 text-[11px] leading-relaxed text-slate-400"
          >
            {readError ? (
              <span className="text-red-300">{readError}</span>
            ) : parsed ? (
              <>
                <p className="text-slate-300">
                  Validasi struktur dasar: lolos. Berkas: {parsed.fileName} ({parsed.sizeMiB.toFixed(2)} MiB).
                </p>
                <p>
                  Cakupan: {scopeLabel(parsed.facts.scope)}. Objek: {parsed.facts.nodes}; garis: {parsed.facts.edges}; item
                  sampah: {parsed.facts.trash}.
                </p>
                <p>
                  Riwayat epistemik: {parsed.facts.history}; episode belajar: {parsed.facts.episodes}; siklus tindakan:{' '}
                  {parsed.facts.cycles}.
                </p>
                <p>
                  Model pengetahuan sumber: V{parsed.facts.sourceModelVersion}; versi yang akan digunakan: V
                  {knowledgeModelVersion}.
                </p>
                {importWarnings.map((warning) => (
                  <p key={warning} className="mt-1 text-amber-300">
                    {warning}
                  </p>
                ))}
              </>
            ) : (
              'Berkas akan dibaca dan divalidasi sebelum aplikasi meminta konfirmasi. Untuk cadangan lengkap, gunakan ekspor seluruh workspace.'
            )}
          </div>

          <fieldset className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-200">
            <legend className="mb-1 text-[11px] font-bold uppercase text-slate-400">Mode impor</legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="dio-mode"
                value="merge"
                className="accent-emerald-500"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              Gabung (ID baru)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="dio-mode"
                value="replace"
                className="accent-emerald-500"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              Ganti seluruh isi
            </label>
          </fieldset>

          <div className="flex flex-col gap-2 border-t border-slate-700/70 pt-2">
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-xs font-bold text-slate-400" htmlFor="dio-rule">
                Aturan penempatan
              </label>
              <select
                id="dio-rule"
                value={rule}
                onChange={(event) => setRule(event.target.value as api.ImportParams['rule'])}
                className="flex-1 cursor-pointer rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
              >
                {PLACEMENT_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {rule === 'offset' ? (
              <div id="dio-offset" className="grid grid-cols-3 gap-2">
                {(['dx', 'dy', 'dz'] as const).map((axis) => (
                  <div key={axis}>
                    <label className="sr-only" htmlFor={`dio-${axis}`}>
                      {`Offset ${axis[1].toUpperCase()}`}
                    </label>
                    <input
                      id={`dio-${axis}`}
                      type="number"
                      step="any"
                      value={offset[axis]}
                      placeholder={axis[1].toUpperCase()}
                      title={`Offset ${axis[1].toUpperCase()}`}
                      onChange={(event) => setOffsetAxis(axis, event.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
              <input
                id="dio-avoid"
                type="checkbox"
                className="accent-emerald-500"
                checked={avoid}
                onChange={(event) => setAvoid(event.target.checked)}
              />
              Hindari tumpang tindih dengan objek yang sudah ada
            </label>
          </div>

          <button
            id="dio-import"
            type="button"
            onClick={() => void handleImport()}
            disabled={busy}
            aria-busy={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <i className="fas fa-upload" aria-hidden="true" /> {busy ? 'Memproses…' : 'Impor'}
          </button>

          {issues.length > 0 ? (
            <ul className="rounded-lg border border-red-800/70 bg-red-950/40 px-3 py-2 text-[11px] leading-relaxed text-red-300">
              {issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <span className="font-mono text-red-400">{issue.path || '(berkas)'}</span>: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}

          {result ? (
            <div role="status" aria-live="polite" className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-200">
              {result}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="dio-snapshot-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="dio-snapshot-heading" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Snapshot pemulihan
          </h3>
          <button
            type="button"
            onClick={() => void handleCreateSnapshot()}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-600"
          >
            <i className="fas fa-camera mr-1" aria-hidden="true" /> Buat snapshot
          </button>
        </div>
        {snapshots.length === 0 ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-3 text-[11px] text-slate-400">
            Belum ada snapshot pemulihan pada workspace ini. Snapshot dibuat otomatis sebelum impor mode Ganti, dan dapat
            dibuat manual kapan saja.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2"
              >
                <i className="fas fa-clock-rotate-left text-emerald-400" aria-hidden="true" />
                <span className="text-xs font-bold text-white">{snapshot.reason || 'snapshot'}</span>
                <span className="text-[11px] text-slate-400">
                  {formatWhen(snapshot.savedAt)} · {(snapshot.bytes / 1024).toFixed(1)} KB
                </span>
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRestore(snapshot)}
                    className="rounded-lg bg-slate-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-600"
                  >
                    Pulihkan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSnapshot(snapshot)}
                    className="rounded-lg bg-red-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-700"
                  >
                    Hapus
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
