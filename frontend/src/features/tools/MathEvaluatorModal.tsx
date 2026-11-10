/**
 * Evaluator Nilai Real-time.
 *
 * Port dari modal evaluator versi lama (markup L5223-5288). Perhitungan
 * diserahkan ke mesin rumus bersama (`features/formula/evaluate`), yang juga
 * menangani definisi `nama = nilai` serta variabel dari objek terhubung;
 * panel ini hanya menampilkan nilai real-time dari ekspresi yang diketik.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateExpression } from '../formula/evaluate';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { Modal } from '../../ui/Modal';

const EXAMPLES = ['sqrt(2)', '2^10', 'sin(pi/4)', 'det([[1,2],[3,4]])'];

/** Clipboard write with the legacy `execCommand` fallback. */
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

export function MathEvaluatorModal() {
  const open = useUiStore((state) => state.mathEvaluatorOpen);
  const close = useUiStore((state) => state.close);
  const pushToast = useAppStore((state) => state.pushToast);

  const [expression, setExpression] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setExpression('');
    const timer = window.setTimeout(() => areaRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [open]);

  const result = useMemo(() => (expression.trim() ? evaluateExpression(expression) : null), [expression]);

  /** Chip insertion keeps the caret where the user left it (legacy L7501). */
  const insertAtCursor = (text: string) => {
    const area = areaRef.current;
    const start = area?.selectionStart ?? expression.length;
    const end = area?.selectionEnd ?? expression.length;
    setExpression(expression.slice(0, start) + text + expression.slice(end));
    window.requestAnimationFrame(() => {
      const pos = start + text.length;
      area?.focus();
      area?.setSelectionRange(pos, pos);
    });
  };

  const handleCopy = async () => {
    const value = result && result.ok ? result.value : '';
    if (!value) {
      pushToast('Belum ada hasil untuk disalin.', 'error');
      return;
    }
    const ok = await copyText(value);
    pushToast(ok ? 'Hasil disalin ke papan klip.' : `Gagal menyalin otomatis. Salin manual: ${value}`, ok ? 'success' : 'error');
  };

  return (
    <Modal
      open={open}
      onClose={() => close('mathEvaluator')}
      title={
        <>
          <i className="fas fa-calculator mr-2 text-green-400" aria-hidden="true" />
          Evaluator Nilai Real-time
        </>
      }
      widthClass="max-w-lg"
    >
      <div className="mb-4">
        <label htmlFor="input-math-expr" className="mb-2 block text-xs font-bold uppercase text-slate-400">
          Ekspresi / Perhitungan
        </label>
        <textarea
          id="input-math-expr"
          ref={areaRef}
          rows={3}
          autoComplete="off"
          spellCheck={false}
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          placeholder="Contoh: 12.5 * log(100)"
          aria-label="Ekspresi atau perhitungan matematika"
          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 font-mono text-sm text-white outline-none transition-all focus:border-green-500 focus:ring-1 focus:ring-green-500"
        />
        <p className="mt-2 text-[10px] leading-relaxed text-purple-300/80">
          <i className="fas fa-lightbulb mr-1" aria-hidden="true" />
          Tips <b>Variabel Global</b>: tulis <code className="rounded bg-slate-900 px-1">nama = nilai</code> (mis.{' '}
          <code className="rounded bg-slate-900 px-1">x = 5</code>) untuk mendefinisikan variabel yang bisa dipanggil objek
          lain yang terhubung dengan garis. Definisi dan ketergantungan antar objek dihitung oleh mesin rumus.
        </p>
      </div>

      <span className="mb-2 block text-xs font-bold uppercase text-slate-400">Hasil Evaluasi</span>
      <div
        id="math-preview"
        role="status"
        aria-live="polite"
        className="flex min-w-[150px] items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 py-4 shadow-inner"
      >
        {result === null ? (
          <span className="font-mono text-xl font-bold text-slate-500">= ?</span>
        ) : result.ok ? (
          <span className="break-all font-mono text-xl font-bold text-green-300">
            = {result.value === '' ? '(kosong)' : result.value}
          </span>
        ) : (
          <span className="break-all font-mono text-sm font-bold text-red-400">= {result.error}</span>
        )}
      </div>

      <div className="mt-4">
        <span className="mb-2 block text-xs font-bold uppercase text-slate-400">Contoh</span>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => insertAtCursor(example)}
              title={`Sisipkan ${example} ke ekspresi`}
              className="rounded-lg border border-slate-600 bg-slate-700 px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:border-green-500 hover:bg-slate-600"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-[10px] leading-relaxed text-slate-500">
        <b className="text-slate-400">Info:</b> nilai ini dapat dilampirkan ke data objek melalui editor pada tahap
        berikutnya, lalu dibaca di mode baca. Satuan mengikuti mesin rumus (mis.{' '}
        <code className="rounded bg-slate-900 px-1">5 cm to inch</code>).
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => close('mathEvaluator')}
          className="rounded-xl bg-slate-700 px-5 py-2.5 font-bold text-white hover:bg-slate-600"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-xl border border-slate-600 bg-slate-700 px-5 py-2.5 font-bold text-white hover:border-green-500 hover:bg-green-600"
        >
          <i className="fas fa-copy mr-2" aria-hidden="true" />
          Salin hasil
        </button>
      </div>
    </Modal>
  );
}
