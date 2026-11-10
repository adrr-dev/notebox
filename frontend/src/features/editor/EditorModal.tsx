/**
 * Object editor for nodes and edges.
 *
 * Ported from the legacy edit pane (markup L3675-4614, open/save L8238-8912,
 * unsaved guard L16466-16527). The dialog edits a local draft and only commits
 * to the store when "Simpan Perubahan" is pressed.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { compile } from 'mathjs';
import { engine } from '../../three/engine';
import { selectEdgeById, selectNodeById, useAppStore, collectLabels } from '../../store/appStore';
import { normalizeDescStyle } from '../../store/normalize';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { Modal } from '../../ui/Modal';
import { evaluateExpression } from '../formula/evaluate';
import { buildEpistemicRelation } from '../epistemic/validate';
import { RELATION_SYMBOLS } from '../graph/relationSymbols.data';
import type { Attachment, DescPage, EdgeRecord, EntityID, GraphKind, NodeRecord, NodeShape } from '../../types/model';
import { AttachmentsEditor, detectTypeFromUrl } from './AttachmentsEditor';
import { EdgeRelationPanel, EMPTY_EDGE_RELATION, edgeRelationToDraft, type EdgeRelationDraft } from './EdgeRelationPanel';
import { EpistemicMetaPanel } from './EpistemicMetaPanel';
import { LabelsInput } from './labelsInput';
import { ProfileIconPicker, profileDefaults, type ProfileVisual } from './ProfileIconPicker';
import { RichTextEditor } from './RichTextEditor';

const SHAPE_OPTIONS: ReadonlyArray<{ value: NodeShape; label: string }> = [
  { value: 'cube', label: 'Kubus Solid' },
  { value: 'sphere', label: 'Bola Presisi' },
  { value: 'cylinder', label: 'Silinder Tabung' },
  { value: 'icosahedron', label: 'Permata (Icosahedron)' },
  { value: 'text3d', label: 'Teks Menyala (Neon)' },
  { value: 'custom_image', label: 'Gambar Kustom (Sprite)' },
  { value: 'graph3d', label: 'Grafik Fungsi (Kurva/Permukaan)' },
  { value: 'container', label: 'Container (Kotak Batas 3D)' },
];

const AXES: ReadonlyArray<{ key: 'posX' | 'posY' | 'posZ'; label: string }> = [
  { key: 'posX', label: 'X' },
  { key: 'posY', label: 'Y' },
  { key: 'posZ', label: 'Z' },
];

interface EditorDraft {
  title: string;
  labels: string[];
  pages: DescPage[];
  attachments: Attachment[];
  mathExpression: string;
  profile: ProfileVisual;
  // Node-only fields.
  kind: string;
  epistemicStatus: string;
  scope: string;
  assumptions: string;
  limitations: string;
  provenance: string;
  shape: NodeShape;
  color: string;
  textureUrl: string;
  scale: number;
  posX: number;
  posY: number;
  posZ: number;
  isStatic: boolean;
  textContent: string;
  imageBase64: string;
  graphType: GraphKind;
  graphFormula: string;
  graphXMin: number;
  graphXMax: number;
  graphYMin: number;
  graphYMax: number;
  // Edge-only fields.
  relation: string;
  epistemic: EdgeRelationDraft;
}

/** Legacy `initEditPages`: page 1 lives in desc/pageTitle/descStyle. */
function pagesOf(record: NodeRecord | EdgeRecord | null): DescPage[] {
  const primary: DescPage = {
    title: record?.pageTitle ?? '',
    desc: record?.desc ?? '',
    style: normalizeDescStyle(record?.descStyle),
  };
  const extras = (record?.pages ?? []).map((page) => ({
    title: page.title ?? '',
    desc: page.desc ?? '',
    style: normalizeDescStyle(page.style),
  }));
  return [primary, ...extras];
}

/** New objects spawn five units from the camera along its view direction. */
function spawnPosition(): { posX: number; posY: number; posZ: number } {
  try {
    const { position, target } = engine.getCameraState();
    const [px, py, pz] = position;
    const [tx, ty, tz] = target;
    const dx = tx - px;
    const dy = ty - py;
    const dz = tz - pz;
    const length = Math.hypot(dx, dy, dz) || 1;
    return {
      posX: Number((px + (dx / length) * 5).toFixed(1)),
      posY: Number((py + (dy / length) * 5).toFixed(1)),
      posZ: Number((pz + (dz / length) * 5).toFixed(1)),
    };
  } catch {
    return { posX: 0, posY: 0, posZ: 5 };
  }
}

function buildDraft(type: 'node' | 'edge', record: NodeRecord | EdgeRecord | null): EditorDraft {
  const defaults = profileDefaults(type);
  const base: EditorDraft = {
    title: record?.title ?? '',
    labels: [...(record?.labels ?? [])],
    pages: pagesOf(record),
    attachments: (record?.attachments ?? []).map((attachment) => ({ ...attachment })),
    mathExpression: record?.mathExpression ?? '',
    profile: {
      profileIcon: record?.profileIcon ?? defaults.profileIcon,
      profileGlyph: record?.profileGlyph ?? '',
      profileImage: record?.profileImage ?? '',
      profileIconColor: record?.profileIconColor ?? defaults.profileIconColor,
      profileIconBg: record?.profileIconBg ?? defaults.profileIconBg,
    },
    kind: 'note',
    epistemicStatus: 'unreviewed',
    scope: '',
    assumptions: '',
    limitations: '',
    provenance: '',
    shape: 'icosahedron',
    color: '#3b82f6',
    textureUrl: '',
    scale: 1,
    posX: 0,
    posY: 0,
    posZ: 0,
    isStatic: false,
    textContent: '',
    imageBase64: '',
    graphType: 'curve',
    graphFormula: '',
    graphXMin: -5,
    graphXMax: 5,
    graphYMin: -5,
    graphYMax: 5,
    relation: 'none',
    epistemic: { ...EMPTY_EDGE_RELATION, sourceRefs: [] },
  };

  if (type === 'node') {
    if (!record) return { ...base, ...spawnPosition() };
    const node = record as NodeRecord;
    return {
      ...base,
      kind: node.kind ?? 'note',
      epistemicStatus: node.epistemicStatus ?? 'unreviewed',
      scope: node.scope ?? '',
      assumptions: node.assumptions ?? '',
      limitations: node.limitations ?? '',
      provenance: node.provenance ?? '',
      shape: node.shape ?? 'icosahedron',
      color: node.color ?? '#3b82f6',
      textureUrl: node.textureUrl ?? '',
      scale: node.scale ?? 1,
      posX: node.posX ?? 0,
      posY: node.posY ?? 0,
      posZ: node.posZ ?? 0,
      isStatic: node.isStatic === true,
      textContent: node.textContent ?? '',
      imageBase64: node.imageBase64 ?? '',
      graphType: node.graphType ?? 'curve',
      graphFormula: node.graphFormula ?? '',
      graphXMin: node.graphXMin ?? -5,
      graphXMax: node.graphXMax ?? 5,
      graphYMin: node.graphYMin ?? -5,
      graphYMax: node.graphYMax ?? 5,
    };
  }

  if (!record) return base;
  const edge = record as EdgeRecord;
  return { ...base, relation: edge.relation ?? 'none', epistemic: edgeRelationToDraft(edge) };
}

function cleanFormula(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.includes('=') ? trimmed.split('=').pop()!.trim() : trimmed;
}

/** Legacy `validateGraphFormula` (L11837-11862). */
function validateGraphFormula(raw: string, kind: GraphKind): { tone: 'idle' | 'valid' | 'invalid'; text: string } {
  const cleaned = cleanFormula(raw);
  if (!cleaned) return { tone: 'idle', text: 'Ketik rumus untuk melihat status validasi...' };
  try {
    const compiled = compile(cleaned);
    const surface = kind === 'surface';
    const sample = surface ? { x: 1, y: 1 } : { x: 1 };
    const value = compiled.evaluate(sample) as unknown;
    const label = surface ? 'x=1, y=1' : 'x=1';
    return { tone: 'valid', text: `✓ Rumus valid. Contoh hasil pada ${label}: ${typeof value === 'number' ? value.toFixed(3) : String(value)}` };
  } catch (error) {
    return { tone: 'invalid', text: `✗ Rumus tidak valid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500';
const LABEL_CLASS = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400';

export function EditorModal() {
  const editing = useAppStore((state) => state.editing);
  if (!editing) return null;
  return <EditorDialog key={`${editing.type}:${String(editing.id)}`} type={editing.type} id={editing.id} />;
}

interface EditorDialogProps {
  type: 'node' | 'edge';
  id: EntityID | null;
}

function EditorDialog({ type, id }: EditorDialogProps) {
  const isNew = id === null || id === undefined;
  const nodeRecord = useAppStore((state) => (type === 'node' ? selectNodeById(id)(state) : undefined));
  const edgeRecord = useAppStore((state) => (type === 'edge' ? selectEdgeById(id)(state) : undefined));
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  /* `collectLabels` returns a fresh array, so it must not be used as a bare
     zustand selector (snapshot identity would never be stable). */
  const suggestions = useMemo(() => collectLabels(nodes, edges), [nodes, edges]);
  const addNode = useAppStore((state) => state.addNode);
  const updateNode = useAppStore((state) => state.updateNode);
  const updateEdge = useAppStore((state) => state.updateEdge);
  const closeEditor = useAppStore((state) => state.closeEditor);
  const pushToast = useAppStore((state) => state.pushToast);

  const existing = type === 'node' ? nodeRecord : edgeRecord;
  const missing = !isNew && !existing;

  const [draft, setDraft] = useState<EditorDraft>(() => buildDraft(type, existing ?? null));
  const [activePage, setActivePage] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!missing) return;
    pushToast('Objek yang akan diedit tidak lagi tersedia.', 'error');
    closeEditor();
  }, [missing, pushToast, closeEditor]);

  const mathPreview = useMemo(() => {
    const expression = draft.mathExpression.trim();
    if (!expression) return { tone: 'idle' as const, text: '= ?' };
    const result = evaluateExpression(expression);
    return result.ok ? { tone: 'valid' as const, text: `= ${result.value}` } : { tone: 'invalid' as const, text: 'Error / Sintaks tidak valid' };
  }, [draft.mathExpression]);

  const graphStatus = useMemo(() => validateGraphFormula(draft.graphFormula, draft.graphType), [draft.graphFormula, draft.graphType]);

  const updateDraft = (patch: Partial<EditorDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const patchActivePage = (patch: Partial<DescPage>) => {
    updateDraft({ pages: draft.pages.map((page, index) => (index === activePage ? { ...page, ...patch } : page)) });
  };

  const setAxis = (key: 'posX' | 'posY' | 'posZ', value: number) => {
    if (key === 'posX') updateDraft({ posX: value });
    else if (key === 'posY') updateDraft({ posY: value });
    else updateDraft({ posZ: value });
  };

  const buildCommonPatch = () => {
    const [primary, ...extra] = draft.pages;
    const expression = draft.mathExpression.trim();
    const evaluation = expression ? evaluateExpression(expression) : null;
    return {
      title: draft.title.trim() || 'Tanpa Judul',
      desc: primary.desc,
      pageTitle: primary.title.trim(),
      descStyle: normalizeDescStyle(primary.style),
      pages: extra.map((page) => ({ title: page.title.trim(), desc: page.desc, style: normalizeDescStyle(page.style) })),
      attachments: draft.attachments
        .filter((attachment) => attachment.url.trim())
        .map((attachment) => ({
          name: attachment.name.trim() || 'Lampiran File',
          url: attachment.url.trim(),
          type: attachment.type && attachment.type !== 'none' ? attachment.type : detectTypeFromUrl(attachment.url.trim()),
        })),
      labels: draft.labels,
      profileIcon: draft.profile.profileIcon,
      profileGlyph: draft.profile.profileGlyph.trim().slice(0, 16),
      profileImage: draft.profile.profileImage,
      profileIconColor: draft.profile.profileIconColor,
      profileIconBg: draft.profile.profileIconBg,
      lastAccessed: Date.now(),
      mathExpression: expression,
      mathValue: evaluation?.ok ? evaluation.value : '',
    };
  };

  const handleSave = () => {
    const common = buildCommonPatch();
    if (type === 'node') {
      const nodePatch: Partial<NodeRecord> = {
        ...common,
        kind: draft.kind || 'note',
        epistemicStatus: draft.epistemicStatus || 'unreviewed',
        scope: draft.scope.trim(),
        assumptions: draft.assumptions.trim(),
        limitations: draft.limitations.trim(),
        provenance: draft.provenance.trim(),
        shape: draft.shape,
        color: draft.color,
        textureUrl: draft.textureUrl.trim(),
        scale: draft.scale,
        posX: draft.posX,
        posY: draft.posY,
        posZ: draft.posZ,
        isStatic: draft.isStatic,
        textContent: draft.textContent.trim(),
        imageBase64: draft.imageBase64 || undefined,
        graphType: draft.graphType,
        graphFormula: draft.graphFormula.trim(),
        graphXMin: draft.graphXMin,
        graphXMax: draft.graphXMax,
        graphYMin: draft.graphYMin,
        graphYMax: draft.graphYMax,
      };
      if (isNew) {
        addNode(nodePatch);
        pushToast('Objek arsip baru berhasil diciptakan!', 'success');
      } else if (existing) {
        updateNode(existing.id, nodePatch);
        pushToast('Pembaruan informasi objek berhasil disimpan.', 'success');
      }
    } else {
      if (!existing || isNew) return;
      const edge = existing as EdgeRecord;
      let epistemicRelation: EdgeRecord['epistemicRelation'];
      let warnings = 0;
      if (draft.epistemic.type) {
        const built = buildEpistemicRelation(edge, draft.epistemic, { nodes, edges });
        if (built.errors.length > 0) {
          pushToast(built.errors[0].message, 'error');
          return;
        }
        epistemicRelation = built.relation ?? undefined;
        warnings = built.warnings.length;
      }
      updateEdge(edge.id, { ...common, relation: draft.relation, epistemicRelation });
      pushToast(
        warnings > 0 ? `Relasi disimpan dengan ${warnings} peringatan semantik. Periksa metadata relasi.` : 'Informasi garis hubung diperbarui.',
        warnings > 0 ? 'info' : 'success',
      );
    }
    closeEditor();
  };

  const requestClose = async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Perubahan belum disimpan',
        message: 'Perubahan belum disimpan. Buang perubahan dan tutup editor?',
        confirmText: 'Buang perubahan',
        cancelText: 'Kembali ke editor',
        tone: 'warning',
      }))
    )
      return;
    closeEditor();
  };

  if (missing) return null;

  const title = isNew ? 'Pembuatan Arsip Objek Baru' : type === 'node' ? 'Edit Informasi Objek' : 'Edit Informasi Garis';
  const isNode = type === 'node';
  const nodeShape = isNode ? draft.shape : 'icosahedron';
  const relationValues = RELATION_SYMBOLS.flatMap((group) => group.options.map((option) => option.value));

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      widthClass="max-w-6xl"
      closeOnBackdrop={false}
      title={
        <span>
          <i className={`fas ${isNew ? 'fa-plus-circle text-green-400' : 'fa-edit text-blue-400'} mr-2`} aria-hidden="true" />
          {title}
        </span>
      }
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="rounded-xl bg-slate-700 px-6 py-3 font-bold text-white transition-colors hover:bg-slate-600"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={type === 'edge' && isNew}
            title={type === 'edge' && isNew ? 'Garis baru dibuat melalui alat Hubungkan pada kanvas.' : undefined}
            className="rounded-xl bg-blue-600 px-8 py-3 font-bold text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fas fa-save mr-2" aria-hidden="true" />
            Simpan Perubahan
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="min-w-0">
            <label htmlFor="input-title" className={LABEL_CLASS}>
              Judul Utama
            </label>
            <div className="flex w-full items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 p-1.5 transition-all focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <ProfileIconPicker
                type={type}
                value={draft.profile}
                onChange={(patch) => updateDraft({ profile: { ...draft.profile, ...patch } })}
              />
              <input
                id="input-title"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.title}
                placeholder="Ketik judul..."
                onChange={(event) => updateDraft({ title: event.target.value })}
                className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2 py-3 text-white outline-none placeholder:text-slate-500 focus:ring-0"
              />
            </div>
          </div>
          <LabelsInput labels={draft.labels} onChange={(labels) => updateDraft({ labels })} suggestions={suggestions} />
        </div>

        {isNode && (
          <EpistemicMetaPanel
            value={{
              kind: draft.kind,
              epistemicStatus: draft.epistemicStatus,
              scope: draft.scope,
              assumptions: draft.assumptions,
              limitations: draft.limitations,
              provenance: draft.provenance,
            }}
            onChange={(patch) => updateDraft(patch)}
          />
        )}

        <div>
          <span className={LABEL_CLASS}>Catatan / Deskripsi Informasi</span>
          <RichTextEditor
            page={draft.pages[activePage] ?? draft.pages[0]}
            pages={draft.pages}
            activeIndex={activePage}
            onChange={patchActivePage}
            onPageListChange={(pages) => updateDraft({ pages })}
            onActiveIndexChange={setActivePage}
          />
        </div>

        <AttachmentsEditor attachments={draft.attachments} onChange={(attachments) => updateDraft({ attachments })} />

        <div className="rounded-xl border border-green-500/25 bg-slate-900/60 p-4">
          <label htmlFor="input-math-expr" className={LABEL_CLASS}>
            Ekspresi Matematika (mathjs)
          </label>
          <textarea
            id="input-math-expr"
            rows={2}
            spellCheck={false}
            autoComplete="off"
            value={draft.mathExpression}
            placeholder="Contoh: 12.5 * log(100) atau 5cm to inch"
            onChange={(event) => updateDraft({ mathExpression: event.target.value })}
            className={`${FIELD_CLASS} resize-y font-mono`}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-purple-300/80">
            <i className="fas fa-lightbulb mr-1" aria-hidden="true" />
            Tips <b>Variabel Global</b>: tulis <code className="rounded bg-slate-900 px-1">nama = nilai</code> (mis.{' '}
            <code className="rounded bg-slate-900 px-1">x = 5</code>) untuk mendefinisikan variabel yang bisa dipanggil objek lain yang
            terhubung dengan garis.
          </p>
          <div className="mt-3 flex min-w-[150px] items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 py-4 shadow-inner">
            <span
              aria-live="polite"
              className={`font-mono font-bold ${
                mathPreview.tone === 'valid' ? 'text-sm text-green-400' : mathPreview.tone === 'invalid' ? 'text-xs text-red-400' : 'text-sm text-slate-500'
              }`}
            >
              {mathPreview.text}
            </span>
          </div>
        </div>

        {isNode ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5 shadow-xl">
            <h3 className="mb-4 border-b border-slate-700/50 pb-2 text-xs font-bold uppercase tracking-widest text-purple-400">
              <i className="fas fa-paint-brush mr-2" aria-hidden="true" />
              Parameter Visual &amp; Fisik 3D
            </h3>
            <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <label htmlFor="input-shape" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                  Bentuk Geometri / Tampilan
                </label>
                <select
                  id="input-shape"
                  value={draft.shape}
                  onChange={(event) => {
                    const shape = event.target.value as NodeShape;
                    updateDraft({
                      shape,
                      ...(shape === 'graph3d' || shape === 'container' ? { isStatic: true } : {}),
                    });
                  }}
                  className={FIELD_CLASS}
                >
                  {SHAPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {nodeShape === 'text3d' && (
                <div className="col-span-full sm:col-span-2">
                  <label htmlFor="input-node-text" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                    Teks 3D Menyala
                  </label>
                  <input
                    id="input-node-text"
                    type="text"
                    autoComplete="off"
                    value={draft.textContent}
                    placeholder="Masukkan teks pendek..."
                    onChange={(event) => updateDraft({ textContent: event.target.value })}
                    className={FIELD_CLASS}
                  />
                </div>
              )}

              {nodeShape === 'custom_image' && (
                <div className="col-span-full sm:col-span-2">
                  <label htmlFor="input-node-image-file" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                    Unggah Gambar Visual
                  </label>
                  <input
                    id="input-node-image-file"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') updateDraft({ imageBase64: reader.result });
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-500"
                  />
                  {draft.imageBase64 && (
                    <p className="mt-1 text-[10px] text-green-400">
                      <i className="fas fa-check mr-1" aria-hidden="true" />
                      Gambar visual siap disimpan.
                    </p>
                  )}
                </div>
              )}

              {nodeShape === 'graph3d' && (
                <div className="col-span-full space-y-3 rounded-xl border border-purple-700/40 bg-slate-800/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex-1">
                      <label htmlFor="input-graph-type" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                        Jenis Grafik
                      </label>
                      <select
                        id="input-graph-type"
                        value={draft.graphType}
                        onChange={(event) => updateDraft({ graphType: event.target.value as GraphKind })}
                        className={FIELD_CLASS}
                      >
                        <option value="curve">Kurva 2D: y = f(x)</option>
                        <option value="surface">Permukaan 3D: z = f(x, y)</option>
                      </select>
                    </div>
                    <div className="flex-[2]">
                      <label htmlFor="input-graph-formula" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                        Rumus (cukup ruas kanan, tanpa &quot;y =&quot; / &quot;z =&quot;)
                      </label>
                      <input
                        id="input-graph-formula"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={draft.graphFormula}
                        placeholder="Contoh: x^2   atau   sin(x)*cos(y)"
                        onChange={(event) => updateDraft({ graphFormula: event.target.value })}
                        className={`${FIELD_CLASS} font-mono`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label htmlFor="input-graph-xmin" className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
                        X Min
                      </label>
                      <input
                        id="input-graph-xmin"
                        type="number"
                        step={0.5}
                        value={draft.graphXMin}
                        onChange={(event) => updateDraft({ graphXMin: Number(event.target.value) })}
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="input-graph-xmax" className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
                        X Maks
                      </label>
                      <input
                        id="input-graph-xmax"
                        type="number"
                        step={0.5}
                        value={draft.graphXMax}
                        onChange={(event) => updateDraft({ graphXMax: Number(event.target.value) })}
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    {draft.graphType === 'surface' && (
                      <>
                        <div>
                          <label htmlFor="input-graph-ymin" className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
                            Y Min
                          </label>
                          <input
                            id="input-graph-ymin"
                            type="number"
                            step={0.5}
                            value={draft.graphYMin}
                            onChange={(event) => updateDraft({ graphYMin: Number(event.target.value) })}
                            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="input-graph-ymax" className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
                            Y Maks
                          </label>
                          <input
                            id="input-graph-ymax"
                            type="number"
                            step={0.5}
                            value={draft.graphYMax}
                            onChange={(event) => updateDraft({ graphYMax: Number(event.target.value) })}
                            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <p
                    aria-live="polite"
                    className={`text-[10px] font-bold ${
                      graphStatus.tone === 'valid' ? 'text-green-400' : graphStatus.tone === 'invalid' ? 'text-red-400' : 'italic text-slate-500'
                    }`}
                  >
                    {graphStatus.text}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="input-color" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                  Warna Dasar
                </label>
                <input
                  id="input-color"
                  type="color"
                  value={draft.color}
                  onChange={(event) => updateDraft({ color: event.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-slate-600 bg-slate-800"
                />
              </div>
              <div>
                <label htmlFor="input-texture-url" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                  URL Tekstur (Opsional)
                </label>
                <input
                  id="input-texture-url"
                  type="text"
                  autoComplete="off"
                  value={draft.textureUrl}
                  placeholder="Tautan gambar..."
                  onChange={(event) => updateDraft({ textureUrl: event.target.value })}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="input-scale" className="mb-2 flex justify-between text-[10px] font-bold uppercase text-slate-400">
                  Skala Ukuran Objek
                  <span className="rounded-full bg-blue-900/50 px-2 text-blue-400">{draft.scale}x</span>
                </label>
                <input
                  id="input-scale"
                  type="range"
                  min={0.2}
                  max={5}
                  step={0.1}
                  value={draft.scale}
                  onChange={(event) => updateDraft({ scale: Number(event.target.value) })}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-blue-500"
                />
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
                <span className="mb-2 block text-[10px] font-bold uppercase text-slate-400">Koordinat Plotting (X, Y, Z)</span>
                <div className="mb-3 flex gap-2">
                  {AXES.map((axis) => (
                    <div
                      key={axis.key}
                      className="flex flex-1 overflow-hidden rounded-lg border border-slate-600 bg-slate-900 focus-within:border-blue-500"
                    >
                      <span className="flex w-8 items-center justify-center bg-slate-700 px-2 py-1.5 text-xs font-bold text-slate-400">
                        {axis.label}
                      </span>
                      <input
                        type="number"
                        step={0.1}
                        value={draft[axis.key]}
                        aria-label={`Koordinat ${axis.label} objek`}
                        onChange={(event) => setAxis(axis.key, Number(event.target.value))}
                        className="w-full bg-transparent px-2 py-1.5 text-center text-sm text-white outline-none"
                      />
                    </div>
                  ))}
                </div>
                <label htmlFor="input-is-static" className="flex w-fit cursor-pointer items-center gap-3 p-1">
                  <input
                    id="input-is-static"
                    type="checkbox"
                    checked={draft.isStatic}
                    onChange={(event) => updateDraft({ isStatic: event.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-300">Objek Statis (Kunci Rotasi/Gerak)</span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5 shadow-xl">
            <h3 className="mb-4 border-b border-slate-700/50 pb-2 text-xs font-bold uppercase tracking-widest text-orange-400">
              <i className="fas fa-link mr-2" aria-hidden="true" />
              Parameter Relasi Garis
            </h3>
            <div className="mb-5">
              <label htmlFor="input-edge-relation" className="mb-1.5 block text-[10px] font-bold uppercase text-slate-400">
                Simbol Relasi Logika/Matematika
              </label>
              <select
                id="input-edge-relation"
                value={draft.relation}
                onChange={(event) => updateDraft({ relation: event.target.value })}
                className={FIELD_CLASS}
              >
                {RELATION_SYMBOLS.map((group, index) =>
                  group.group === null ? (
                    <Fragment key={`plain-${index}`}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Fragment>
                  ) : (
                    <optgroup key={group.group ?? index} label={group.group ?? ''}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
                {draft.relation && !relationValues.includes(draft.relation) && (
                  <option value={draft.relation}>Simbol tersimpan tidak dikenal · {draft.relation}</option>
                )}
              </select>
            </div>
            {existing && (
              <EdgeRelationPanel
                edge={existing as EdgeRecord}
                draft={draft.epistemic}
                onChange={(patch) => updateDraft({ epistemic: { ...draft.epistemic, ...patch } })}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
