/**
 * Read-only object viewer.
 *
 * Ports the legacy view modal (legacy L9026-9226 markup + L8934-9123 paging):
 * identity header, epistemic metadata, math line, attachments, paged
 * description and the edge relation panel. Opening a record stamps
 * `lastAccessed` exactly once.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useAppStore } from '../../store/appStore';
import { KatexMath } from '../../ui/katex';
import { Modal } from '../../ui/Modal';
import { ProfileAvatar } from '../editor/ProfileIconPicker';
import {
  EPISTEMIC_KIND_LABELS,
  EPISTEMIC_SCHEMA_V2,
  EPISTEMIC_STATUS_LABELS,
} from '../epistemic/schemaV2.catalog';
import { RELATION_LABEL_BY_VALUE } from '../graph/relationSymbols.data';
import { identityOf, sanitizeRichHTML, viewPagesOf } from './viewPages';
import type { Attachment, DescStyle, EdgeRecord, NodeRecord } from '../../types/model';

const KIND_LABELS: Record<string, string> = { ...EPISTEMIC_KIND_LABELS };
const STATUS_LABELS: Record<string, string> = { ...EPISTEMIC_STATUS_LABELS };
const RELATION_TYPE_LABELS: Record<string, string> = {};
for (const [key, value] of Object.entries(EPISTEMIC_SCHEMA_V2.relationTypes)) {
  RELATION_TYPE_LABELS[key] = value.label;
}

type ViewRecord = NodeRecord | EdgeRecord;

/** legacy L6392 */
function formatDateId(ts?: number): string {
  if (!ts) return 'Tidak diketahui';
  return new Date(ts).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Reading style of a page, applied to the description block. */
function descStyleToCss(style?: DescStyle): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.fontSize) css.fontSize = style.fontSize;
  if (style.lineHeight) css.lineHeight = style.lineHeight;
  if (style.textAlign) css.textAlign = style.textAlign;
  if (style.maxWidth) css.maxWidth = style.maxWidth;
  if (style.padding) css.padding = style.padding;
  if (style.useTextColor && style.textColor) css.color = style.textColor;
  if (style.useBackgroundColor && style.backgroundColor) css.backgroundColor = style.backgroundColor;
  return css;
}

/** Restricts an attachment URL to embedded images and http(s)/blob origins. */
function attachmentUrl(attachment: Attachment): string {
  const raw = String(attachment.url ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) {
    return attachment.type === 'image' && /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(raw)
      ? raw
      : '';
  }
  try {
    const url = new URL(raw, window.location.href);
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

const ATTACHMENT_ICONS: Record<string, { icon: string; tone: string; label: string }> = {
  image: { icon: 'fa-image', tone: 'text-green-400', label: 'Gambar' },
  video: { icon: 'fa-film', tone: 'text-red-400', label: 'Video' },
  audio: { icon: 'fa-music', tone: 'text-yellow-400', label: 'Audio' },
  document: { icon: 'fa-file-alt', tone: 'text-blue-400', label: 'Dokumen' },
};

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const meta = ATTACHMENT_ICONS[String(attachment.type ?? 'document')] ?? ATTACHMENT_ICONS.document;
  const url = attachmentUrl(attachment);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-600 bg-slate-800/80 p-3">
      <div className="flex items-center gap-3">
        <i className={`fas ${meta.icon} ${meta.tone} w-10 shrink-0 text-center text-2xl`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">{attachment.name || 'Lampiran'}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{meta.label}</div>
        </div>
      </div>
      {attachment.type === 'image' && url && (
        <img
          src={url}
          alt={attachment.name || 'Lampiran gambar'}
          referrerPolicy="no-referrer"
          className="max-h-48 w-full rounded-lg object-contain"
        />
      )}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-slate-700 px-3 py-2 text-center text-[10px] font-bold text-white transition-colors hover:bg-slate-600"
        >
          <i className="fas fa-external-link-alt mr-1" aria-hidden="true" /> Buka
        </a>
      ) : (
        <span
          className="cursor-not-allowed rounded-lg bg-slate-800 px-3 py-2 text-center text-[10px] font-bold text-slate-500 opacity-60"
          title="Alamat lampiran tidak aman atau tidak didukung"
        >
          Alamat tidak tersedia
        </span>
      )}
    </div>
  );
}

export function ViewModal() {
  const viewing = useAppStore((state) => state.viewing);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const updateNode = useAppStore((state) => state.updateNode);
  const updateEdge = useAppStore((state) => state.updateEdge);
  const closeViewer = useAppStore((state) => state.closeViewer);
  const openEditor = useAppStore((state) => state.openEditor);

  const node = viewing?.type === 'node' ? nodes.find((n) => String(n.id) === String(viewing.id)) : undefined;
  const edge = viewing?.type === 'edge' ? edges.find((e) => String(e.id) === String(viewing.id)) : undefined;
  const record: ViewRecord | undefined = node ?? edge;

  const pages = useMemo(() => (record ? viewPagesOf(record) : []), [record]);
  const [pageIndex, setPageIndex] = useState(0);
  const swipe = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  // Stamp lastAccessed once per opened record (legacy stamped on open too).
  useEffect(() => {
    if (!viewing) return;
    const stamp = Date.now();
    if (viewing.type === 'node') updateNode(viewing.id, { lastAccessed: stamp });
    else updateEdge(viewing.id, { lastAccessed: stamp });
  }, [viewing, updateNode, updateEdge]);

  // Restart at page 1 whenever a different object is opened.
  useEffect(() => {
    setPageIndex(0);
  }, [viewing?.type, viewing?.id]);

  const open = Boolean(viewing && record);
  const go = useCallback(
    (delta: number) => {
      setPageIndex((current) => Math.max(0, Math.min(current + delta, Math.max(0, pages.length - 1))));
    },
    [pages.length],
  );

  useEffect(() => {
    if (!open || pages.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, go, pages.length]);

  if (!viewing || !record) return null;

  const labels = record.labels ?? [];
  const isNode = viewing.type === 'node';
  const mathValue = record.mathValue ?? '';
  const mathError = mathValue.includes('Error');
  const currentPage = pages[pageIndex] ?? pages[0];
  const multiPage = pages.length > 1;
  const descHtml = currentPage?.desc ? sanitizeRichHTML(currentPage.desc) : '';

  const titleOf = (id: unknown): string => {
    const match = nodes.find((n) => String(n.id) === String(id));
    return match?.title || `Node ${String(id)}`;
  };

  const epistemic = isNode ? node : undefined;
  const epistemicFields: (keyof NodeRecord)[] = [];
  if (epistemic) {
    for (const key of ['kind', 'epistemicStatus', 'scope', 'assumptions', 'limitations', 'provenance'] as const) {
      if (String(epistemic[key] ?? '').trim()) epistemicFields.push(key);
    }
  }
  const relation = edge?.epistemicRelation;

  const onPointerDown = (event: ReactPointerEvent) => {
    swipe.current = { x: event.clientX, y: event.clientY, active: true };
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    if (!swipe.current.active) return;
    const dx = event.clientX - swipe.current.x;
    const dy = event.clientY - swipe.current.y;
    swipe.current.active = false;
    // legacy L9001-9024: horizontal flick of >70px, clearly not a vertical drag.
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) go(dx < 0 ? 1 : -1);
  };
  const onPointerCancel = () => {
    swipe.current.active = false;
  };

  return (
    <Modal
      open={open}
      onClose={closeViewer}
      title="Lihat"
      widthClass="max-w-3xl"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={closeViewer}
            className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-600"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => openEditor(viewing.type, viewing.id)}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-500"
          >
            <i className="fas fa-pen mr-1.5" aria-hidden="true" /> Ubah
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-4 border-b border-slate-700 pb-4">
        <ProfileAvatar visual={identityOf(record, viewing.type)} size="large" className="shadow-inner" />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                isNode
                  ? 'border-blue-700/50 bg-blue-900/50 text-blue-300'
                  : 'border-orange-700/50 bg-orange-900/50 text-orange-300'
              }`}
            >
              {isNode ? 'Objek' : 'Garis'}
            </span>
            <span className="rounded-full bg-slate-900/50 px-2 py-0.5 text-[10px] text-slate-400">
              <i className="far fa-clock mr-1" aria-hidden="true" />
              Dibuat {formatDateId(record.createdAt)} · Dilihat {formatDateId(record.lastAccessed)}
            </span>
          </div>
          <h2 className="mb-2 text-2xl leading-tight font-bold text-white md:text-3xl">
            {record.title || 'Tanpa Judul'}
          </h2>
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="rounded-full border border-slate-600 bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-200"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {epistemic && epistemicFields.length > 0 && (
        <section className="mt-4 mb-4 space-y-3 rounded-xl border border-violet-500/30 bg-violet-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-widest text-violet-200">
                <i className="fas fa-scale-balanced mr-2" aria-hidden="true" />Metadata epistemik
              </h3>
              <p className="mt-2 text-sm font-semibold text-white">
                {KIND_LABELS[String(epistemic.kind ?? 'note')] ?? epistemic.kind ?? 'Catatan'}
              </p>
            </div>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-200">
              {STATUS_LABELS[String(epistemic.epistemicStatus ?? 'unreviewed')] ??
                epistemic.epistemicStatus ??
                'Belum ditinjau'}
            </span>
          </div>
          {String(epistemic.scope ?? '').trim() && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Ruang lingkup</p>
              <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{epistemic.scope}</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {String(epistemic.assumptions ?? '').trim() && (
              <div className="rounded-lg bg-slate-900/50 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Asumsi</p>
                <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{epistemic.assumptions}</p>
              </div>
            )}
            {String(epistemic.limitations ?? '').trim() && (
              <div className="rounded-lg bg-slate-900/50 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Batas dan ketidakpastian
                </p>
                <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{epistemic.limitations}</p>
              </div>
            )}
          </div>
          {String(epistemic.provenance ?? '').trim() && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Asal-usul informasi</p>
              <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{epistemic.provenance}</p>
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-slate-500">
            Status ini adalah metadata yang dicatat pengguna. Status “didukung bukti” tidak dengan sendirinya
            membuktikan klaim benar di semua konteks.
          </p>
        </section>
      )}

      {edge && (
        <section className="mt-4 mb-4 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
            <span className="font-mono text-2xl text-orange-300">{edge.relation || '—'}</span>
            <span className="text-sm text-slate-200">
              {RELATION_LABEL_BY_VALUE.get(edge.relation) ?? 'Garis Hubung Tanpa Simbol'}
            </span>
          </div>
          <div className="text-sm text-slate-300">
            <span className="font-semibold text-white">{titleOf(edge.sourceId)}</span>
            <i className="fas fa-arrow-right mx-2 text-slate-500" aria-hidden="true" />
            <span className="font-semibold text-white">{titleOf(edge.targetId)}</span>
          </div>
          {relation && (
            <div className="space-y-3 rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">
                    <i className="fas fa-diagram-project mr-2" aria-hidden="true" />Relasi epistemik
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {relation.type === 'custom'
                      ? relation.customLabel || 'Relasi khusus'
                      : (RELATION_TYPE_LABELS[relation.type] ?? `Relasi tersimpan: ${relation.type}`)}
                  </p>
                  <p className="mt-1 text-xs break-words text-slate-300">
                    {titleOf(edge.sourceId)} → {titleOf(edge.targetId)}
                  </p>
                </div>
                <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-200">
                  {STATUS_LABELS[relation.status ?? 'unreviewed'] ?? relation.status ?? 'Belum ditinjau'}
                </span>
              </div>
              {relation.type === 'custom' && String(relation.customLabel ?? '').trim() && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Label khusus</p>
                  <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{relation.customLabel}</p>
                </div>
              )}
              {String(relation.rationale ?? '').trim() && (
                <div className="rounded-lg bg-slate-900/50 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Alasan</p>
                  <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{relation.rationale}</p>
                </div>
              )}
              {String(relation.qualifier ?? '').trim() && (
                <div className="rounded-lg bg-slate-900/50 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Kondisi / batas</p>
                  <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{relation.qualifier}</p>
                </div>
              )}
              {relation.sourceRefs && relation.sourceRefs.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sumber tambahan</p>
                  <div className="flex flex-col gap-1.5">
                    {relation.sourceRefs.map((ref, index) => {
                      const resolved =
                        ref.unresolved || !ref.id
                          ? ''
                          : ref.type === 'node'
                            ? nodes.find((n) => String(n.id) === String(ref.id))?.title ?? ''
                            : edges.find((e) => String(e.id) === String(ref.id))?.title ?? '';
                      const title = resolved || ref.titleSnapshot || `${ref.type === 'node' ? 'Objek' : 'Garis'} ${String(ref.id)}`;
                      return (
                        <p
                          key={`${String(ref.id)}-${index}`}
                          className="rounded-lg bg-slate-900/50 p-2 text-xs break-words text-slate-200"
                        >
                          {ref.type === 'node' ? 'Objek' : 'Garis'}: {title}
                          {ref.unresolved ? ' · belum terselesaikan' : ''}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-[10px] leading-relaxed text-slate-500">
                Makna dibaca dari node sumber menuju node tujuan. Kedekatan posisi atau tampilan garis saja tidak
                membuktikan adanya hubungan epistemik.
              </p>
            </div>
          )}
        </section>
      )}

      {record.mathExpression && (
        <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-slate-900/60 p-4">
          <div className="flex min-w-0 flex-col">
            <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-green-500/80">
              Hasil Evaluasi
            </span>
            <KatexMath expression={record.mathExpression} className="text-xs text-slate-300" />
          </div>
          <span
            className={`font-mono text-xl font-bold md:text-2xl ${mathError ? 'text-red-400' : 'text-green-400'}`}
          >
            {mathError ? 'Error' : `= ${mathValue}`}
          </span>
        </div>
      )}

      {mathValue && !mathError && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-emerald-200">
            {`= ${mathValue}`}
          </span>
        </div>
      )}

      {record.attachments && record.attachments.length > 0 && (
        <section className="mt-4 mb-4 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <i className="fas fa-paperclip mr-1 text-blue-400" aria-hidden="true" /> Lampiran Dokumen/Media
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {record.attachments.map((attachment, index) => (
              <AttachmentCard key={`${attachment.name}-${index}`} attachment={attachment} />
            ))}
          </div>
        </section>
      )}

      <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        {multiPage && (
          <div className="mb-4 border-b border-slate-700 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={pageIndex === 0}
                title="Halaman sebelumnya (←)"
                aria-label="Halaman sebelumnya"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-white transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <div
                role="tablist"
                aria-label="Halaman deskripsi"
                className="flex flex-1 gap-1.5 overflow-x-auto py-0.5"
              >
                {pages.map((page, index) => (
                  <button
                    key={index}
                    type="button"
                    role="tab"
                    id={`view-page-tab-${index}`}
                    aria-selected={index === pageIndex}
                    aria-controls="view-page-panel"
                    title={page.title || (index === 0 ? 'Utama' : `Halaman ${index + 1}`)}
                    onClick={() => setPageIndex(index)}
                    className={`min-w-7 shrink-0 rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${
                      index === pageIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <span className="shrink-0 font-mono text-xs text-slate-400">
                {pageIndex + 1} / {pages.length}
              </span>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={pageIndex === pages.length - 1}
                title="Halaman berikutnya (→)"
                aria-label="Halaman berikutnya"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-white transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${((pageIndex + 1) / pages.length) * 100}%` }}
              />
            </div>
          </div>
        )}
        {currentPage?.title && (multiPage || pageIndex > 0) && (
          <h3 className="mb-3 text-lg font-bold text-white">{currentPage.title}</h3>
        )}
        <div
          id="view-page-panel"
          role="tabpanel"
          aria-labelledby={multiPage ? `view-page-tab-${pageIndex}` : undefined}
          className="prose prose-invert mb-4 max-w-none text-sm leading-relaxed break-words text-slate-200 md:text-base"
          style={descStyleToCss(currentPage?.style)}
          dangerouslySetInnerHTML={{
            __html: descHtml || '<i class="text-slate-500">Tidak ada rincian deskripsi tertulis.</i>',
          }}
        />
      </div>
    </Modal>
  );
}
