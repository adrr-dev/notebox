/**
 * Rich description editor with multi-page support.
 *
 * Ported from the legacy note editor: the toolbar (markup L3823-3975), the
 * page bar (markup L3811-3845, logic L8608-8730) and the four-group settings
 * panel (markup L3898-4156, logic L29538-29902).
 *
 * The contenteditable surface is deliberately uncontrolled: React never
 * renders children into it, HTML is written imperatively and sanitized on read,
 * paste, and explicit apply. `document.execCommand` is kept for parity with the
 * legacy editor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeDescStyle } from '../../store/normalize';
import { useAppStore } from '../../store/appStore';
import { confirmDialog } from '../../ui/ConfirmDialog';
import type { DescPage } from '../../types/model';
import { DescStylePanel, descSurfaceStyle } from './DescStylePanel';
import { escapeHtml, safeLinkUrl, sanitizeRichHTML } from './richTextHtml';

const SETTINGS_TABS = [
  { id: 'structure', label: 'Struktur & sisipan', icon: 'fa-heading' },
  { id: 'display', label: 'Gaya halaman', icon: 'fa-palette' },
  { id: 'find', label: 'Cari & statistik', icon: 'fa-magnifying-glass' },
  { id: 'source', label: 'HTML lanjutan', icon: 'fa-code' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

const TOOLBAR_BUTTON =
  'grid h-8 w-8 place-items-center rounded border border-slate-600 bg-slate-800 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-white';
const PANEL_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-[.55rem] border border-slate-600 bg-slate-800 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-white';
const PANEL_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-[.55rem] border border-cyan-600 bg-cyan-900/40 px-2.5 py-2 text-xs text-cyan-100 transition-colors hover:bg-cyan-800/60';
const PANEL_CONTROL =
  'block w-full min-w-0 rounded-[.55rem] border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-[13px] text-slate-200 outline-none focus:border-cyan-400';

function isInsideEditor(editor: HTMLElement, node: Node | null): boolean {
  if (!node) return false;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!element && (element === editor || editor.contains(element));
}

export interface RichTextEditorProps {
  /** The active page. */
  page: DescPage;
  /** Every page of the object, page 1 first. */
  pages: DescPage[];
  activeIndex: number;
  onChange: (patch: Partial<DescPage>) => void;
  onPageListChange: (pages: DescPage[]) => void;
  onActiveIndexChange: (index: number) => void;
}

export function RichTextEditor({
  page,
  pages,
  activeIndex,
  onChange,
  onPageListChange,
  onActiveIndexChange,
}: RichTextEditorProps) {
  const pushToast = useAppStore((state) => state.pushToast);
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastHtmlRef = useRef<string>('');
  const findStateRef = useRef<{ query: string; index: number }>({ query: '', index: 0 });

  const [activeTab, setActiveTab] = useState<SettingsTab>('structure');
  const [blockFormat, setBlockFormat] = useState('P');
  const [linkUrl, setLinkUrl] = useState('');
  const [textColor, setTextColor] = useState('#93c5fd');
  const [highlightColor, setHighlightColor] = useState('#facc15');
  const [latex, setLatex] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [htmlSource, setHtmlSource] = useState('');
  const [stats, setStats] = useState({ words: 0, chars: 0, elements: 0 });

  const activeStyle = normalizeDescStyle(page.style);

  const updateStats = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const text = String(editor.innerText || editor.textContent || '').replace(/\u00a0/g, ' ').trim();
    const words = text ? (text.match(/\S+/g) ?? []).length : 0;
    setStats({ words, chars: text.length, elements: editor.querySelectorAll('*').length });
  }, []);

  const rememberSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    if (isInsideEditor(editor, selection.anchorNode) && isInsideEditor(editor, selection.focusNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return false;
    const saved = savedRangeRef.current;
    if (saved && isInsideEditor(editor, saved.startContainer) && isInsideEditor(editor, saved.endContainer)) {
      try {
        selection.removeAllRanges();
        selection.addRange(saved);
        return true;
      } catch {
        /* stale range: fall through to the live selection */
      }
    }
    return selection.rangeCount > 0 && isInsideEditor(editor, selection.anchorNode);
  }, []);

  /* The document owns the editor's HTML: write it only when it differs from
     what the store already holds, so typing never loses the caret. */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = sanitizeRichHTML(page.desc);
    if (next !== lastHtmlRef.current) {
      editor.innerHTML = next;
      lastHtmlRef.current = next;
    }
    findStateRef.current = { query: '', index: 0 };
    updateStats();
  }, [page.desc, activeIndex, updateStats]);

  useEffect(() => {
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, [rememberSelection]);

  useEffect(() => {
    if (activeTab !== 'source') return;
    /* Snapshot the store copy when the source tab opens; the textarea then
       owns its own text until "Terapkan HTML aman" is pressed. */
    setHtmlSource(sanitizeRichHTML(page.desc));
  }, [activeTab, activeIndex]);

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    rememberSelection();
    const safe = sanitizeRichHTML(editor.innerHTML);
    lastHtmlRef.current = safe;
    if (safe !== page.desc) onChange({ desc: safe });
    updateStats();
  };

  const runCommand = (command: string, value?: string) => {
    if (!restoreSelection()) {
      pushToast('Letakkan kursor atau pilih teks di dalam Catatan terlebih dahulu.', 'error');
      return false;
    }
    try {
      document.execCommand(command, false, value);
    } catch {
      /* command unsupported by this browser */
    }
    editorRef.current?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'format' }));
    rememberSelection();
    updateStats();
    return true;
  };

  /** Inserts already-escaped markup at the saved selection (legacy helper L8614). */
  const insertRichHtml = (rawHtml: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!restoreSelection()) editor.focus();
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichHTML(rawHtml);
    const fragment = template.content.cloneNode(true);
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !isInsideEditor(editor, selection.anchorNode)) {
      editor.appendChild(fragment);
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    rememberSelection();
    updateStats();
  };

  const selectedText = () => String(window.getSelection()?.toString() ?? '');

  const collectMatches = (query: string): Range[] => {
    const editor = editorRef.current;
    const matches: Range[] = [];
    if (!editor || !query) return matches;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        (node as Text).parentElement && !['SCRIPT', 'STYLE'].includes((node as Text).parentElement!.tagName)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const needle = query.toLocaleLowerCase();
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue ?? '';
      const haystack = text.toLocaleLowerCase();
      let from = 0;
      while (from <= haystack.length - needle.length) {
        const found = haystack.indexOf(needle, from);
        if (found < 0) break;
        const range = document.createRange();
        range.setStart(node, found);
        range.setEnd(node, found + query.length);
        matches.push(range);
        from = found + Math.max(query.length, 1);
      }
      node = walker.nextNode();
    }
    return matches;
  };

  /** Finds the next occurrence on the active page and selects it. */
  const findNext = (): { range: Range; count: number; index: number } | null => {
    const query = findText;
    if (!query) {
      pushToast('Isi teks yang ingin dicari.', 'error');
      return null;
    }
    const matches = collectMatches(query);
    if (matches.length === 0) {
      pushToast('Teks tidak ditemukan pada halaman aktif.', 'error');
      return null;
    }
    const index = findStateRef.current.query !== query ? 0 : (findStateRef.current.index + 1) % matches.length;
    findStateRef.current = { query, index };
    const range = matches[index];
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      savedRangeRef.current = range.cloneRange();
    }
    const rect = range.getBoundingClientRect();
    if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) editorRef.current?.scrollIntoView({ block: 'nearest' });
    editorRef.current?.focus({ preventScroll: true });
    return { range, count: matches.length, index };
  };

  const handleReplaceOne = () => {
    const found = findNext();
    if (!found) return;
    found.range.deleteContents();
    const replacementNode = document.createTextNode(replaceText);
    found.range.insertNode(replacementNode);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const caret = document.createRange();
      caret.setStartAfter(replacementNode);
      caret.collapse(true);
      selection.addRange(caret);
      savedRangeRef.current = caret.cloneRange();
    }
    editorRef.current?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    updateStats();
    pushToast('Satu kemunculan diganti.', 'success');
  };

  const handleReplaceAll = async () => {
    const query = findText;
    if (!query) {
      pushToast('Isi teks yang ingin dicari.', 'error');
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        (node as Text).parentElement && !['SCRIPT', 'STYLE'].includes((node as Text).parentElement!.tagName)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let cursor = walker.nextNode();
    while (cursor) {
      nodes.push(cursor as Text);
      cursor = walker.nextNode();
    }
    const count = nodes.reduce((sum, node) => sum + ((node.nodeValue ?? '').match(pattern) ?? []).length, 0);
    if (count === 0) {
      pushToast('Tidak ada teks yang cocok pada halaman aktif.', 'error');
      return;
    }
    if (
      count > 1 &&
      !(await confirmDialog({
        title: 'Ganti beberapa kemunculan teks?',
        message: `Ganti ${count} kemunculan teks pada halaman aktif? Isi halaman lain tidak diubah. Tindakan ini diterapkan pada editor dan baru disimpan ke objek setelah “Simpan Perubahan”.`,
        confirmText: 'Ganti semua',
        tone: 'warning',
      }))
    )
      return;
    for (const node of nodes) {
      const text = node.nodeValue ?? '';
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        node.nodeValue = text.replace(pattern, () => replaceText);
      }
      pattern.lastIndex = 0;
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    findStateRef.current = { query: '', index: 0 };
    updateStats();
    pushToast(`${count} kemunculan diganti pada halaman aktif. Simpan objek untuk menerapkan perubahan.`, 'success');
  };

  const applyHtmlSource = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const safe = sanitizeRichHTML(htmlSource);
    editor.innerHTML = safe;
    lastHtmlRef.current = safe;
    setHtmlSource(safe);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    onChange({ desc: safe });
    updateStats();
    pushToast('HTML disaring dan diterapkan ke editor. Simpan objek untuk menyimpan perubahan.', 'success');
  };

  const addPage = () => {
    onPageListChange([...pages.slice(0, activeIndex + 1), { title: '', desc: '', style: { ...activeStyle } }, ...pages.slice(activeIndex + 1)]);
    onActiveIndexChange(activeIndex + 1);
  };

  const duplicatePage = () => {
    onPageListChange([
      ...pages.slice(0, activeIndex + 1),
      { title: page.title, desc: page.desc, style: { ...activeStyle } },
      ...pages.slice(activeIndex + 1),
    ]);
    onActiveIndexChange(activeIndex + 1);
  };

  const deletePage = async () => {
    if (pages.length <= 1) return;
    const ok = await confirmDialog({
      title: 'Hapus halaman?',
      message: `Hapus halaman ${activeIndex + 1} beserta isinya?`,
      confirmText: 'Hapus halaman',
      tone: 'danger',
    });
    if (!ok) return;
    const next = pages.filter((_, index) => index !== activeIndex);
    onPageListChange(next);
    onActiveIndexChange(Math.min(activeIndex, next.length - 1));
  };

  const movePage = (direction: number) => {
    const target = activeIndex + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[activeIndex], next[target]] = [next[target], next[activeIndex]];
    onPageListChange(next);
    onActiveIndexChange(target);
  };

  const applyStyleToAllPages = async () => {
    const count = pages.length;
    const ok = await confirmDialog({
      title: 'Terapkan gaya ke semua halaman?',
      message: `Terapkan gaya halaman saat ini ke semua ${count} halaman objek? Gaya khusus pada halaman lain akan digantikan, tetapi isi teksnya tidak diubah.`,
      confirmText: 'Terapkan ke semua',
      tone: 'warning',
    });
    if (!ok) return;
    onPageListChange(pages.map((item) => ({ ...item, style: { ...activeStyle } })));
    pushToast(`Gaya halaman diterapkan ke ${count} halaman. Tekan “Simpan Perubahan” untuk menyimpan objek.`, 'success');
  };

  return (
    <div>
      <div className="mb-2 flex flex-col gap-2.5 rounded-xl border border-slate-700 bg-slate-900/60 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Halaman catatan">
            {pages.map((item, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                title={item.title ? item.title : index === 0 ? '' : `Halaman ${index + 1}`}
                onClick={() => onActiveIndexChange(index)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                  index === activeIndex
                    ? 'border-blue-400 bg-blue-600 text-white'
                    : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <button type="button" onClick={addPage} title="Tambah halaman baru" className={`${PANEL_BUTTON} border-dashed`}>
            <i className="fas fa-plus mr-1" aria-hidden="true" /> Halaman
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            autoComplete="off"
            value={page.title}
            aria-label="Judul halaman ini (opsional)"
            placeholder="Judul halaman ini (opsional)"
            onChange={(event) => onChange({ title: event.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
          />
          <button type="button" onClick={() => movePage(-1)} disabled={activeIndex === 0} title="Geser halaman ke kiri" className={`${TOOLBAR_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => movePage(1)} disabled={activeIndex === pages.length - 1} title="Geser halaman ke kanan" className={`${TOOLBAR_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}>
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </button>
          <button type="button" onClick={duplicatePage} title="Duplikat halaman" className={TOOLBAR_BUTTON}>
            <i className="far fa-clone" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void deletePage()}
            disabled={pages.length <= 1}
            title="Hapus halaman"
            className={`${TOOLBAR_BUTTON} text-red-300 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t-xl border border-slate-600 bg-slate-900/80 p-2 backdrop-blur"
        onMouseDown={(event) => {
          if (!(event.target as HTMLElement).closest('input, select, [role="tab"]')) event.preventDefault();
        }}
      >
        <button type="button" onClick={() => runCommand('bold')} title="Tebal" className={TOOLBAR_BUTTON}>
          <i className="fas fa-bold" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('italic')} title="Miring" className={TOOLBAR_BUTTON}>
          <i className="fas fa-italic" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('underline')} title="Garis Bawah" className={TOOLBAR_BUTTON}>
          <i className="fas fa-underline" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('strikethrough')} title="Coret" className={TOOLBAR_BUTTON}>
          <i className="fas fa-strikethrough" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => runCommand('hiliteColor', highlightColor)}
          title="Highlight — gunakan warna dari pengaturan sorotan"
          aria-label="Sorot teks dengan warna yang dipilih"
          className={TOOLBAR_BUTTON}
        >
          <i className="fas fa-highlighter text-yellow-500" aria-hidden="true" />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-600" />
        <button type="button" onClick={() => runCommand('insertUnorderedList')} title="Daftar Titik" className={TOOLBAR_BUTTON}>
          <i className="fas fa-list-ul" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('insertOrderedList')} title="Daftar Angka" className={TOOLBAR_BUTTON}>
          <i className="fas fa-list-ol" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('indent')} title="Menjorok" className={TOOLBAR_BUTTON}>
          <i className="fas fa-indent" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('outdent')} title="Kurangi inden" className={TOOLBAR_BUTTON}>
          <i className="fas fa-outdent" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => runCommand('insertHorizontalRule')}
          title="Garis Pembatas"
          aria-label="Sisipkan garis pembatas"
          className={TOOLBAR_BUTTON}
        >
          <i className="fas fa-minus" aria-hidden="true" />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-600" />
        <button type="button" onClick={() => runCommand('subscript')} title="Subskrip" className={TOOLBAR_BUTTON}>
          <i className="fas fa-subscript" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('superscript')} title="Superskrip" className={TOOLBAR_BUTTON}>
          <i className="fas fa-superscript" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => insertRichHtml('<code>kode</code>')} title="Kode sebaris" className={TOOLBAR_BUTTON}>
          <i className="fas fa-code" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('undo')} title="Urungkan" className={TOOLBAR_BUTTON}>
          <i className="fas fa-rotate-left" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => runCommand('redo')} title="Ulangi" className={TOOLBAR_BUTTON}>
          <i className="fas fa-rotate-right" aria-hidden="true" />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[10px] text-slate-400">
            Warna teks
            <input
              type="color"
              value={textColor}
              aria-label="Warna teks pilihan"
              onChange={(event) => setTextColor(event.target.value)}
              className="ml-1 h-6 w-8 cursor-pointer rounded border border-slate-600 bg-slate-950 p-0.5 align-middle"
            />
          </label>
          <label className="text-[10px] text-slate-400">
            Warna sorotan
            <input
              type="color"
              value={highlightColor}
              aria-label="Warna sorotan teks"
              onChange={(event) => setHighlightColor(event.target.value)}
              className="ml-1 h-6 w-8 cursor-pointer rounded border border-slate-600 bg-slate-950 p-0.5 align-middle"
            />
          </label>
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-multiline="true"
        aria-label="Catatan / Deskripsi Informasi"
        onInput={handleInput}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onPaste={(event) => {
          const html = event.clipboardData.getData('text/html');
          if (!html) return; /* plain text keeps the native paste behaviour */
          event.preventDefault();
          insertRichHtml(html);
        }}
        className="ri3d-rich-scope min-h-[250px] w-full overflow-y-auto rounded-b-xl border border-t-0 border-slate-600 bg-slate-900 text-sm leading-relaxed text-white outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        style={descSurfaceStyle(activeStyle, true)}
      />

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400" role="note">
        Catatan, gaya halaman, dan perubahan sumber HTML adalah bagian dari objek yang sedang diedit. Perubahan baru disimpan ke objek saat Anda
        menekan <strong className="text-slate-200">Simpan Perubahan</strong>. Tindakan “Ganti semua” hanya memengaruhi halaman aktif.
      </p>

      <details className="mt-3 overflow-hidden rounded-xl border border-cyan-500/25 bg-slate-900/45">
        <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-slate-800/70">
          <i className="fas fa-sliders-h text-cyan-300" aria-hidden="true" />
          <span className="flex-1">Pengaturan Catatan / Deskripsi</span>
          <span className="text-[11px] font-normal text-slate-400">Satu panel · empat kelompok</span>
        </summary>
        <div className="border-t border-slate-700/80 p-2">
          <div
            role="tablist"
            aria-label="Kelompok pengaturan Catatan dan Deskripsi"
            className="mb-2 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/55 p-1.5 sm:grid-cols-4"
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`desc-settings-tab-${tab.id}`}
                aria-controls={`desc-settings-panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-bold ${
                  activeTab === tab.id ? 'bg-cyan-900/60 text-cyan-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <i className={`fas ${tab.icon}`} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {activeTab === 'structure' && (
            <section
              id="desc-settings-panel-structure"
              role="tabpanel"
              aria-labelledby="desc-settings-tab-structure"
              className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/35 p-3"
            >
              <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto]">
                <label htmlFor="desc-block-format" className="text-xs text-slate-400">
                  Jenis blok / paragraf
                  <select id="desc-block-format" value={blockFormat} onChange={(event) => setBlockFormat(event.target.value)} className={`${PANEL_CONTROL} mt-1`}>
                    <option value="P">Paragraf biasa</option>
                    <option value="H1">Judul besar</option>
                    <option value="H2">Judul bagian</option>
                    <option value="BLOCKQUOTE">Kutipan</option>
                  </select>
                </label>
                <button type="button" onClick={() => runCommand('formatBlock', blockFormat)} className={PANEL_BUTTON}>
                  <i className="fas fa-heading" aria-hidden="true" /> Terapkan blok
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const text = selectedText();
                    insertRichHtml(text.trim() ? `<code>${escapeHtml(text)}</code>` : '<code>kode</code>');
                  }}
                  className={PANEL_BUTTON}
                >
                  <i className="fas fa-code" aria-hidden="true" /> Kode sebaris
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = selectedText();
                    insertRichHtml(
                      `<blockquote style="border-left:4px solid #38bdf8;padding:10px 14px;background-color:#172554;border-radius:0 8px 8px 0"><b>Catatan penting</b><br>${escapeHtml(
                        text || 'Tulis gagasan utama, batas, atau hal yang perlu diperhatikan.',
                      )}</blockquote><p><br></p>`,
                    );
                  }}
                  className={PANEL_BUTTON}
                >
                  <i className="fas fa-lightbulb" aria-hidden="true" /> Kotak sorotan
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertRichHtml(
                      '<table style="border-collapse:collapse;width:100%"><tbody><tr><th>Kolom 1</th><th>Kolom 2</th><th>Kolom 3</th></tr><tr><td>Isi</td><td>Isi</td><td>Isi</td></tr></tbody></table><p><br></p>',
                    )
                  }
                  className={PANEL_BUTTON}
                >
                  <i className="fas fa-table" aria-hidden="true" /> Tabel 2 × 3
                </button>
                <button type="button" onClick={() => runCommand('unlink')} className={PANEL_BUTTON}>
                  <i className="fas fa-unlink" aria-hidden="true" /> Lepas tautan
                </button>
                <button type="button" onClick={() => runCommand('foreColor', textColor)} className={PANEL_BUTTON}>
                  <i className="fas fa-font" aria-hidden="true" /> Terapkan warna teks terpilih
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 p-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="desc-link-url" className="mb-1 block text-xs text-slate-400">
                    Alamat tautan (URL)
                  </label>
                  <input
                    id="desc-link-url"
                    type="url"
                    autoComplete="url"
                    value={linkUrl}
                    placeholder="https://... atau mailto:..."
                    onChange={(event) => setLinkUrl(event.target.value)}
                    className={PANEL_CONTROL}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Pilih teks terlebih dahulu untuk menjadikannya tautan.</p>
                  <button
                    type="button"
                    onClick={() => {
                      const url = safeLinkUrl(linkUrl);
                      if (!url) {
                        pushToast('Masukkan tautan http, https, atau mailto yang valid.', 'error');
                        return;
                      }
                      if (selectedText().trim()) runCommand('createLink', url);
                      else insertRichHtml(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Tautan baru</a>`);
                    }}
                    className={`${PANEL_PRIMARY} mt-2`}
                  >
                    <i className="fas fa-link" aria-hidden="true" /> Buat tautan
                  </button>
                </div>
                <div>
                  <label htmlFor="desc-latex" className="mb-1 block text-xs text-slate-400">
                    Sisipkan rumus (LaTeX)
                  </label>
                  <input
                    id="desc-latex"
                    type="text"
                    spellCheck={false}
                    value={latex}
                    placeholder="Contoh: \\frac{a}{b}"
                    onChange={(event) => setLatex(event.target.value)}
                    className={PANEL_CONTROL}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Tersimpan sebagai teks $…$ dan dirender saat dibaca.</p>
                  <button
                    type="button"
                    onClick={() => {
                      const code = latex.trim();
                      if (!code) return;
                      insertRichHtml(escapeHtml(`$${code}$ `));
                      setLatex('');
                    }}
                    className={`${PANEL_PRIMARY} mt-2`}
                  >
                    <i className="fas fa-square-root-alt" aria-hidden="true" /> Sisipkan rumus
                  </button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Perintah format bekerja pada pilihan teks atau blok tempat kursor berada. Tautan dan HTML impor akan disaring sebelum
                disimpan.
              </p>
            </section>
          )}

          {activeTab === 'display' && (
            <section
              id="desc-settings-panel-display"
              role="tabpanel"
              aria-labelledby="desc-settings-tab-display"
              className="rounded-lg border border-slate-700 bg-slate-950/35"
            >
              <DescStylePanel
                style={activeStyle}
                onChange={(style) => onChange({ style })}
                onApplyToAllPages={() => void applyStyleToAllPages()}
              />
            </section>
          )}

          {activeTab === 'find' && (
            <section
              id="desc-settings-panel-find"
              role="tabpanel"
              aria-labelledby="desc-settings-tab-find"
              className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/35 p-3"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Cari teks
                  <input value={findText} placeholder="Teks yang dicari" onChange={(event) => setFindText(event.target.value)} className={`${PANEL_CONTROL} mt-1`} />
                </label>
                <label className="text-xs text-slate-400">
                  Ganti dengan
                  <input value={replaceText} placeholder="Teks pengganti" onChange={(event) => setReplaceText(event.target.value)} className={`${PANEL_CONTROL} mt-1`} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const found = findNext();
                    if (found) pushToast(`Ditemukan ${found.count} kecocokan. Sorotan berpindah ke hasil ${found.index + 1}.`);
                  }}
                  className={PANEL_BUTTON}
                >
                  <i className="fas fa-magnifying-glass" aria-hidden="true" /> Cari berikutnya
                </button>
                <button type="button" onClick={handleReplaceOne} className={PANEL_BUTTON}>
                  <i className="fas fa-right-left" aria-hidden="true" /> Ganti satu
                </button>
                <button type="button" onClick={() => void handleReplaceAll()} className={PANEL_BUTTON}>
                  <i className="fas fa-repeat" aria-hidden="true" /> Ganti semua pada halaman
                </button>
              </div>
              <p className="text-xs text-slate-400" aria-label="Statistik teks halaman aktif">
                {stats.words.toLocaleString('id-ID')} kata · {stats.chars.toLocaleString('id-ID')} karakter · {stats.elements.toLocaleString('id-ID')} elemen HTML
              </p>
            </section>
          )}

          {activeTab === 'source' && (
            <section
              id="desc-settings-panel-source"
              role="tabpanel"
              aria-labelledby="desc-settings-tab-source"
              className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/35 p-3"
            >
              <p className="text-[11px] leading-relaxed text-slate-400">
                Gunakan hanya jika perlu mengedit struktur HTML secara langsung. Saat diterapkan, skrip, formulir, atribut berbahaya, dan URL
                tidak aman akan dibuang otomatis.
              </p>
              <textarea
                rows={8}
                spellCheck={false}
                value={htmlSource}
                aria-label="Sumber HTML halaman aktif"
                placeholder="Sumber HTML halaman aktif…"
                onChange={(event) => setHtmlSource(event.target.value)}
                className={`${PANEL_CONTROL} min-h-[10rem] resize-y font-mono text-xs`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHtmlSource(editorRef.current?.innerHTML ?? '');
                    pushToast('Sumber HTML halaman aktif dimuat.', 'success');
                  }}
                  className={PANEL_BUTTON}
                >
                  <i className="fas fa-download" aria-hidden="true" /> Muat dari editor
                </button>
                <button type="button" onClick={applyHtmlSource} className={PANEL_PRIMARY}>
                  <i className="fas fa-check" aria-hidden="true" /> Terapkan HTML aman
                </button>
              </div>
            </section>
          )}
        </div>
      </details>
    </div>
  );
}
