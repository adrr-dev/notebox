/**
 * Per-page description style controls.
 *
 * Ported from the legacy "Gaya halaman" tab (markup L3935-4000, logic
 * L29655-29745): twelve controls, five presets and a reset. The panel is
 * controlled; the active page owns its `DescStyle`.
 */
import type { CSSProperties } from 'react';
import { DEFAULT_DESC_STYLE, normalizeDescStyle } from '../../store/normalize';
import type { DescStyle } from '../../types/model';

export interface DescStyleOption {
  value: string;
  label: string;
}

const FONT_OPTIONS: readonly DescStyleOption[] = [
  { value: 'inherit', label: 'Ikuti tema' },
  { value: 'Inter, sans-serif', label: 'Sans modern' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Serif klasik' },
  { value: 'Courier New, monospace', label: 'Monospace / kode' },
];
const SIZE_OPTIONS: readonly DescStyleOption[] = [
  { value: '', label: 'Ikuti ukuran bawaan' },
  { value: '12', label: '12 px' },
  { value: '14', label: '14 px' },
  { value: '16', label: '16 px' },
  { value: '18', label: '18 px' },
  { value: '20', label: '20 px' },
  { value: '24', label: '24 px' },
];
const LINE_OPTIONS: readonly DescStyleOption[] = [
  { value: '', label: 'Ikuti tema' },
  { value: '1.35', label: 'Rapat · 1,35' },
  { value: '1.5', label: '1,5' },
  { value: '1.65', label: '1,65' },
  { value: '1.8', label: 'Longgar · 1,8' },
  { value: '2', label: 'Sangat longgar · 2' },
];
const ALIGN_OPTIONS: readonly DescStyleOption[] = [
  { value: 'left', label: 'Kiri' },
  { value: 'justify', label: 'Rata kiri-kanan' },
  { value: 'center', label: 'Tengah' },
  { value: 'right', label: 'Kanan' },
];
const WIDTH_OPTIONS: readonly DescStyleOption[] = [
  { value: '48ch', label: 'Sempit · 48 karakter' },
  { value: '68ch', label: 'Standar · 68 karakter' },
  { value: '80ch', label: 'Lebar · 80 karakter' },
  { value: '100%', label: 'Lebar penuh' },
];
const GAP_OPTIONS: readonly DescStyleOption[] = [
  { value: '0', label: 'Tanpa jarak' },
  { value: '6', label: '6 px' },
  { value: '12', label: '12 px' },
  { value: '18', label: '18 px' },
  { value: '24', label: '24 px' },
];
const INDENT_OPTIONS: readonly DescStyleOption[] = [
  { value: '0', label: 'Tanpa inden' },
  { value: '1', label: '1 em' },
  { value: '2', label: '2 em' },
];
const PADDING_OPTIONS: readonly DescStyleOption[] = [
  { value: '0', label: '0 px' },
  { value: '8', label: '8 px' },
  { value: '16', label: '16 px' },
  { value: '24', label: '24 px' },
];

/** Quick presets (legacy L29691-29697). */
export const DESC_STYLE_PRESETS: Record<string, Partial<DescStyle>> = {
  reading: { ...DEFAULT_DESC_STYLE, fontSize: '16', lineHeight: '1.65', maxWidth: '68ch', paragraphSpacing: '12' },
  compact: { ...DEFAULT_DESC_STYLE, fontSize: '14', lineHeight: '1.35', maxWidth: '48ch', paragraphSpacing: '6' },
  presentation: { ...DEFAULT_DESC_STYLE, fontSize: '20', lineHeight: '1.5', maxWidth: '80ch', textAlign: 'center', paragraphSpacing: '18' },
  focus: {
    ...DEFAULT_DESC_STYLE,
    fontSize: '16',
    lineHeight: '1.65',
    maxWidth: '68ch',
    padding: '16',
    useBackgroundColor: true,
    backgroundColor: '#172554',
    paragraphSpacing: '12',
  },
  code: {
    ...DEFAULT_DESC_STYLE,
    fontFamily: 'Courier New, monospace',
    fontSize: '14',
    lineHeight: '1.5',
    maxWidth: '80ch',
    textAlign: 'left',
    padding: '16',
    useBackgroundColor: true,
    backgroundColor: '#111827',
    paragraphSpacing: '6',
  },
};

const PRESET_LABELS: Record<string, string> = {
  reading: 'Membaca nyaman',
  compact: 'Ringkas',
  presentation: 'Presentasi',
  focus: 'Catatan fokus',
  code: 'Catatan teknis / kode',
};

/**
 * Style applied to the live editor surface (legacy `applyStyle` L29722-29740).
 * `isEditor` keeps a minimum inner padding so text never touches the frame.
 */
export function descSurfaceStyle(style: DescStyle, isEditor: boolean): CSSProperties & Record<string, string | number> {
  return {
    fontFamily: style.fontFamily === 'inherit' ? '' : style.fontFamily,
    fontSize: style.fontSize ? `${style.fontSize}px` : '',
    lineHeight: style.lineHeight || '',
    textAlign: style.textAlign,
    width: '100%',
    maxWidth: style.maxWidth,
    marginLeft: 'auto',
    marginRight: 'auto',
    color: style.useTextColor ? style.textColor : '',
    backgroundColor: style.useBackgroundColor ? style.backgroundColor : '',
    padding: isEditor ? (style.padding === '0' ? '1rem' : `${style.padding}px`) : `${style.padding}px`,
    borderRadius: style.useBackgroundColor ? '.75rem' : '',
    boxSizing: 'border-box',
    '--ri3d-desc-paragraph-gap': `${style.paragraphSpacing}px`,
    '--ri3d-desc-paragraph-indent': style.paragraphIndent === '0' ? '0' : `${style.paragraphIndent}em`,
  };
}

interface StyleSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly DescStyleOption[];
  onChange: (value: string) => void;
}

function StyleSelect({ id, label, value, options, onChange }: StyleSelectProps) {
  return (
    <label htmlFor={id} className="text-xs text-slate-400">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full min-w-0 rounded-[.55rem] border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-[13px] text-slate-200 outline-none focus:border-cyan-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface DescStylePanelProps {
  style: DescStyle;
  onChange: (style: DescStyle) => void;
  onApplyToAllPages: () => void;
}

export function DescStylePanel({ style, onChange, onApplyToAllPages }: DescStylePanelProps) {
  const patch = (values: Partial<DescStyle>) => onChange(normalizeDescStyle({ ...style, ...values }));

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label htmlFor="desc-style-preset" className="text-xs text-slate-400">
          Preset cepat
          <select
            id="desc-style-preset"
            value=""
            onChange={(event) => {
              const preset = DESC_STYLE_PRESETS[event.target.value];
              if (preset) onChange(normalizeDescStyle(preset));
            }}
            className="mt-1 block w-full min-w-0 rounded-[.55rem] border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-[13px] text-slate-200 outline-none focus:border-cyan-400"
          >
            <option value="">Pilih preset…</option>
            {Object.entries(PRESET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <StyleSelect id="desc-style-font" label="Jenis huruf" value={style.fontFamily} options={FONT_OPTIONS} onChange={(value) => patch({ fontFamily: value })} />
        <StyleSelect id="desc-style-size" label="Ukuran teks" value={style.fontSize} options={SIZE_OPTIONS} onChange={(value) => patch({ fontSize: value })} />
        <StyleSelect id="desc-style-line" label="Jarak antarbaris" value={style.lineHeight} options={LINE_OPTIONS} onChange={(value) => patch({ lineHeight: value })} />
        <StyleSelect
          id="desc-style-align"
          label="Perataan teks"
          value={style.textAlign}
          options={ALIGN_OPTIONS}
          onChange={(value) => patch({ textAlign: value as DescStyle['textAlign'] })}
        />
        <StyleSelect id="desc-style-width" label="Lebar area baca" value={style.maxWidth} options={WIDTH_OPTIONS} onChange={(value) => patch({ maxWidth: value })} />
        <StyleSelect id="desc-style-gap" label="Jarak antarparagraf" value={style.paragraphSpacing} options={GAP_OPTIONS} onChange={(value) => patch({ paragraphSpacing: value })} />
        <StyleSelect id="desc-style-indent" label="Inden awal paragraf" value={style.paragraphIndent} options={INDENT_OPTIONS} onChange={(value) => patch({ paragraphIndent: value })} />
        <StyleSelect id="desc-style-padding" label="Ruang dalam / padding" value={style.padding} options={PADDING_OPTIONS} onChange={(value) => patch({ padding: value })} />

        <div className="space-y-2 rounded-lg border border-slate-700 p-2.5">
          <label htmlFor="desc-style-use-color" className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span>Warna teks khusus</span>
            <input
              id="desc-style-use-color"
              type="checkbox"
              checked={style.useTextColor}
              onChange={(event) => patch({ useTextColor: event.target.checked })}
              className="accent-cyan-400"
            />
          </label>
          <input
            id="desc-style-color"
            type="color"
            value={style.textColor}
            aria-label="Warna teks halaman aktif"
            onChange={(event) => patch({ textColor: event.target.value })}
            className="block h-9 w-full cursor-pointer rounded-[.55rem] border border-slate-600 bg-slate-950 p-1"
          />
        </div>
        <div className="space-y-2 rounded-lg border border-slate-700 p-2.5">
          <label htmlFor="desc-style-use-bg" className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span>Latar halaman khusus</span>
            <input
              id="desc-style-use-bg"
              type="checkbox"
              checked={style.useBackgroundColor}
              onChange={(event) => patch({ useBackgroundColor: event.target.checked })}
              className="accent-cyan-400"
            />
          </label>
          <input
            id="desc-style-bg"
            type="color"
            value={style.backgroundColor}
            aria-label="Warna latar halaman aktif"
            onChange={(event) => patch({ backgroundColor: event.target.value })}
            className="block h-9 w-full cursor-pointer rounded-[.55rem] border border-slate-600 bg-slate-950 p-1"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-700 pt-3">
        <button
          type="button"
          onClick={onApplyToAllPages}
          className="inline-flex items-center gap-1.5 rounded-[.55rem] border border-slate-600 bg-slate-800 px-2.5 py-2 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
        >
          <i className="fas fa-layer-group" aria-hidden="true" /> Terapkan gaya ke semua halaman
        </button>
        <button
          type="button"
          onClick={() => onChange(normalizeDescStyle(DEFAULT_DESC_STYLE))}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[.55rem] border border-slate-600 bg-slate-800 px-2.5 py-2 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
        >
          <i className="fas fa-rotate-left" aria-hidden="true" /> Kembalikan gaya
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Gaya berlaku pada halaman aktif dan tersimpan bersama objek. Format lokal pada bagian teks tetap dipertahankan; pratinjau diperbarui
        langsung.
      </p>
    </div>
  );
}
