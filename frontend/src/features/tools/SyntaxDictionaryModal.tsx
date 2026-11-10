/**
 * Kamus Referensi Sintaks LaTeX.
 *
 * Port dari modal kamus sintaks versi lama (markup L5293-5343, logika
 * L7097-7570): pencarian kode/kata kunci, filter kategori, kartu dengan
 * pratinjau KaTeX, dan tombol salin.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SYNTAX_CATEGORIES } from '../editor/syntaxCategories.data';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { Modal } from '../../ui/Modal';
import { renderMathInto } from '../../ui/katex';

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

interface SyntaxCardProps {
  code: string;
  desc: string;
  onCopy: (code: string, message: string) => void;
}

/** One dictionary entry: KaTeX preview, code, description and copy buttons. */
function SyntaxCard({ code, desc, onCopy }: SyntaxCardProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    renderMathInto(previewRef.current, code, false);
  }, [code]);

  return (
    <div className="syntax-entry flex flex-col gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 p-2.5 transition-all hover:border-purple-500/70">
      <div
        ref={previewRef}
        aria-hidden="true"
        className="syntax-preview flex h-8 items-center justify-center text-white"
      />
      <code className="block truncate rounded bg-purple-900/30 px-1.5 py-0.5 text-center text-[10px] text-purple-300">
        {code}
      </code>
      <span className="text-center text-[9px] leading-tight text-slate-500">{desc}</span>
      <div className="mt-1 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onCopy(code, 'Sintaks disalin.')}
          className="rounded-lg bg-slate-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-600"
        >
          <i className="fas fa-copy mr-1" aria-hidden="true" />
          Salin
        </button>
        <button
          type="button"
          title="Menyisipkan otomatis ke editor rumus tersedia pada tahap berikutnya; untuk sekarang kode disalin."
          onClick={() => onCopy(code, 'Sintaks disalin untuk disisipkan.')}
          className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-700"
        >
          <i className="fas fa-paste mr-1" aria-hidden="true" />
          Salin untuk disisipkan
        </button>
      </div>
    </div>
  );
}

export function SyntaxDictionaryModal() {
  const open = useUiStore((state) => state.syntaxDictOpen);
  const close = useUiStore((state) => state.close);
  const pushToast = useAppStore((state) => state.pushToast);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SYNTAX_CATEGORIES.filter((entry) => category === 'all' || category === entry.name)
      .map((entry) => ({
        name: entry.name,
        items: entry.items.filter(
          (item) => !needle || item.code.toLowerCase().includes(needle) || item.desc.toLowerCase().includes(needle),
        ),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [query, category]);

  const shown = groups.reduce((total, entry) => total + entry.items.length, 0);

  const handleCopy = async (code: string, message: string) => {
    const ok = await copyText(code);
    pushToast(ok ? message : `Gagal menyalin otomatis. Salin manual: ${code}`, ok ? 'success' : 'error');
  };

  return (
    <Modal
      open={open}
      onClose={() => close('syntaxDict')}
      title={
        <>
          <i className="fas fa-book mr-2 text-purple-400" aria-hidden="true" />
          Kamus Referensi Sintaks LaTeX
        </>
      }
      widthClass="max-w-3xl"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => close('syntaxDict')}
            className="rounded-xl bg-slate-700 px-5 py-2 text-sm font-bold text-white hover:bg-slate-600"
          >
            Selesai
          </button>
        </div>
      }
    >
      <p className="mb-1 text-[11px] text-slate-400">
        Klik salah satu kartu untuk menyalin kodenya ke clipboard. Pratinjau di setiap kartu dirender dengan KaTeX,
        sehingga yang terlihat adalah hasil akhir rumusnya.
      </p>
      <p className="mb-3 text-[11px] text-slate-500">
        Tombol “Salin untuk disisipkan” menyiapkan kode agar dapat ditempel ke editor rumus; penyisipan otomatis ke editor
        akan tersedia pada tahap berikutnya.
      </p>

      <div className="mb-4 flex shrink-0 flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <i className="fas fa-search text-xs text-slate-500" aria-hidden="true" />
          </span>
          <label className="sr-only" htmlFor="syntax-dict-search">
            Cari kode atau kata kunci sintaks
          </label>
          <input
            id="syntax-dict-search"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari kode atau kata kunci... (mis: akar, sqrt, integral)"
            className="w-full rounded-lg border border-slate-600 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-purple-500"
          />
        </div>
        <label className="sr-only" htmlFor="syntax-dict-category">
          Kategori sintaks
        </label>
        <select
          id="syntax-dict-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="cursor-pointer rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 outline-none focus:border-purple-500"
        >
          <option value="all">Semua Kategori</option>
          {SYNTAX_CATEGORIES.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>

      {shown === 0 ? (
        <div id="syntax-dict-empty" className="py-10 text-center text-sm text-slate-500">
          <i className="fas fa-ghost mb-2 block text-2xl" aria-hidden="true" />
          Tidak ada sintaks yang cocok ditemukan.
        </div>
      ) : (
        <div id="syntax-dict-list" className="flex flex-col gap-5 pr-1">
          {groups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h3 className="mb-2 border-b border-slate-700/50 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-purple-400">
                {group.name}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.items.map((item) => (
                  <SyntaxCard key={`${group.name}-${item.code}`} code={item.code} desc={item.desc} onCopy={handleCopy} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
