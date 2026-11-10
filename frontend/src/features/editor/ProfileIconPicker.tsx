/**
 * Profile/identity picker for nodes and edges.
 *
 * Ported from the legacy object-profile customizer (markup L29238-29276, CSS
 * `#ri3d-object-profile-styles` L3032-3098, logic L29277-29510): icon grid,
 * custom glyph/emoji, optional PNG/JPG/WebP avatar (max 512 KB) and the two
 * identity colors. The panel is controlled: the draft object lives in
 * `EditorModal` and is only persisted when the user presses "Simpan Perubahan".
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';

/** Identity fields shared by nodes and edges. */
export interface ProfileVisual {
  profileIcon: string;
  profileGlyph: string;
  profileImage: string;
  profileIconColor: string;
  profileIconBg: string;
}

export interface ProfileIconOption {
  icon: string;
  label: string;
}

/** Icon choices offered by the legacy customizer (L29288-29292). */
export const PROFILE_ICONS: readonly ProfileIconOption[] = [
  { icon: 'fa-cube', label: 'Kubus' },
  { icon: 'fa-book-open', label: 'Buku' },
  { icon: 'fa-brain', label: 'Pikiran' },
  { icon: 'fa-lightbulb', label: 'Gagasan' },
  { icon: 'fa-flask', label: 'Eksperimen' },
  { icon: 'fa-calculator', label: 'Matematika' },
  { icon: 'fa-atom', label: 'Sains' },
  { icon: 'fa-code', label: 'Kode' },
  { icon: 'fa-question', label: 'Pertanyaan' },
  { icon: 'fa-circle-check', label: 'Validasi' },
  { icon: 'fa-scale-balanced', label: 'Penilaian' },
  { icon: 'fa-eye', label: 'Observasi' },
  { icon: 'fa-file-lines', label: 'Dokumen' },
  { icon: 'fa-image', label: 'Gambar' },
  { icon: 'fa-link', label: 'Relasi' },
  { icon: 'fa-diagram-project', label: 'Diagram' },
  { icon: 'fa-globe', label: 'Dunia' },
  { icon: 'fa-user', label: 'Profil' },
  { icon: 'fa-flag', label: 'Tujuan' },
  { icon: 'fa-compass', label: 'Eksplorasi' },
  { icon: 'fa-wrench', label: 'Prosedur' },
  { icon: 'fa-bolt', label: 'Energi' },
  { icon: 'fa-chart-line', label: 'Data' },
  { icon: 'fa-star', label: 'Penting' },
];

const KNOWN_ICONS: Record<string, true> = {
  'fa-cube': true, 'fa-book-open': true, 'fa-brain': true, 'fa-lightbulb': true, 'fa-flask': true,
  'fa-calculator': true, 'fa-atom': true, 'fa-code': true, 'fa-question': true, 'fa-circle-check': true,
  'fa-scale-balanced': true, 'fa-eye': true, 'fa-file-lines': true, 'fa-image': true, 'fa-link': true,
  'fa-diagram-project': true, 'fa-globe': true, 'fa-user': true, 'fa-flag': true, 'fa-compass': true,
  'fa-wrench': true, 'fa-bolt': true, 'fa-chart-line': true, 'fa-star': true,
};

const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const MAX_PROFILE_IMAGE_CHARS = 750000;

function isHexColor(value: unknown): boolean {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? ''));
}

/** Portrait data URLs accepted by the picker (raster only, size-capped). */
export function validProfileImage(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_PROFILE_IMAGE_CHARS && DATA_IMAGE_RE.test(value) ? value : '';
}

/** Default identity per entity type (legacy `typeDefaults` L29296-29300). */
export function profileDefaults(type: 'node' | 'edge'): ProfileVisual {
  return type === 'edge'
    ? { profileIcon: 'fa-diagram-project', profileGlyph: '', profileImage: '', profileIconColor: '#fb923c', profileIconBg: '#431407' }
    : { profileIcon: 'fa-cube', profileGlyph: '', profileImage: '', profileIconColor: '#60a5fa', profileIconBg: '#172554' };
}

export interface ProfileAvatarProps {
  visual: ProfileVisual;
  className?: string;
  /** `inline` mirrors the small avatar inside the title input. */
  size?: 'inline' | 'large';
}

/** The identity mark itself: custom image, custom glyph, or Font Awesome icon. */
export function ProfileAvatar({ visual, className = '', size = 'inline' }: ProfileAvatarProps) {
  const image = validProfileImage(visual.profileImage);
  const glyph = (visual.profileGlyph ?? '').trim();
  const icon = Object.hasOwn(KNOWN_ICONS, visual.profileIcon) ? visual.profileIcon : 'fa-cube';
  const color = isHexColor(visual.profileIconColor) ? visual.profileIconColor : '#60a5fa';
  const background = isHexColor(visual.profileIconBg) ? visual.profileIconBg : '#172554';
  const box = size === 'inline' ? 'w-full h-full rounded-[.5rem] text-[1.15rem]' : 'h-16 w-16 rounded-xl text-3xl';
  return (
    <span
      className={`grid place-items-center overflow-hidden border ${box} ${className}`}
      style={{ color, backgroundColor: background, borderColor: color }}
    >
      {image ? (
        <img src={image} alt="" draggable={false} className="block h-full w-full object-cover" />
      ) : glyph ? (
        <span className="grid h-full w-full place-items-center overflow-hidden leading-none">{glyph}</span>
      ) : (
        <i className={`fas ${icon}`} aria-hidden="true" />
      )}
    </span>
  );
}

export interface ProfileIconPickerProps {
  type: 'node' | 'edge';
  value: ProfileVisual;
  onChange: (patch: Partial<ProfileVisual>) => void;
}

export function ProfileIconPicker({ type, value, onChange }: ProfileIconPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pushToast = useAppStore((state) => state.pushToast);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    /* `Modal` listens for Escape on the capture phase of `document`; a window
       capture listener runs first so Escape closes only this popover. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const readImageFile = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
      pushToast('Gambar profil harus PNG, JPG, atau WebP dan maksimal 512 KB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = validProfileImage(reader.result);
      if (!result) {
        pushToast('Format gambar profil tidak dapat digunakan.', 'error');
        return;
      }
      onChange({ profileImage: result, profileGlyph: '' });
    };
    reader.onerror = () => pushToast('Gambar profil gagal dibaca.', 'error');
    reader.readAsDataURL(file);
  };

  const glyph = (value.profileGlyph ?? '').trim();
  const image = validProfileImage(value.profileImage);
  const activeIcon = Object.hasOwn(KNOWN_ICONS, value.profileIcon) ? value.profileIcon : profileDefaults(type).profileIcon;
  const appearance = image
    ? 'gambar profil kustom'
    : glyph
      ? `simbol kustom ${glyph.slice(0, 16)}`
      : `ikon ${PROFILE_ICONS.find((option) => option.icon === activeIcon)?.label ?? 'bawaan'}`;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        title="Kustomisasi ikon/profil"
        aria-label="Buka kustomisasi ikon dan profil"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="relative grid h-[2.85rem] w-[2.85rem] shrink-0 place-items-center rounded-[.65rem] border border-transparent bg-transparent p-[.12rem] transition-colors hover:border-slate-700 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
      >
        <ProfileAvatar visual={value} />
        <span
          className="absolute -bottom-[.12rem] -right-[.12rem] grid h-[1.05rem] w-[1.05rem] place-items-center rounded-full border border-slate-800 bg-blue-600 text-[.48rem] text-slate-50"
          aria-hidden="true"
        >
          <i className="fas fa-sliders" />
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Kustomisasi ikon dan profil"
          className="absolute left-0 top-full z-30 mt-2 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] overflow-auto rounded-2xl border border-slate-600 bg-slate-900/98 p-3.5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-2.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-50">Ikon &amp; profil</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                Penanda visual untuk objek atau garis. Ikon, simbol, dan gambar profil tidak mengubah isi pengetahuan maupun geometri 3D.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="Tutup kustomisasi"
              title="Tutup"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3.5">
            <span className="mb-1.5 block text-[11px] font-bold text-slate-300">Pilih ikon</span>
            <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Pilihan ikon">
              {PROFILE_ICONS.map((option) => {
                const pressed = option.icon === activeIcon && !glyph && !image;
                return (
                  <button
                    key={option.icon}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={pressed}
                    onClick={() => onChange({ profileIcon: option.icon, profileGlyph: '', profileImage: '' })}
                    className={`grid aspect-square place-items-center rounded-[.6rem] border text-base ${
                      pressed ? 'border-sky-400 bg-blue-700 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <i className={`fas ${option.icon}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3.5">
            <label htmlFor={`${panelId}-glyph`} className="mb-1.5 block text-[11px] font-bold text-slate-300">
              Simbol atau emoji kustom
            </label>
            <input
              id={`${panelId}-glyph`}
              type="text"
              maxLength={16}
              autoComplete="off"
              value={value.profileGlyph ?? ''}
              placeholder="Misalnya: 🧠 atau ∑"
              onChange={(event) => onChange({ profileGlyph: event.target.value.slice(0, 16), ...(event.target.value.trim() ? { profileImage: '' } : {}) })}
              className="w-full rounded-[.6rem] border border-slate-600 bg-slate-950 px-2.5 py-2 text-[13px] text-slate-50 outline-none focus:border-blue-400"
            />
            <p className="mt-1 text-[11px] text-slate-400">Jika diisi, simbol menggantikan ikon pilihan. Kosongkan untuk memakai ikon.</p>
          </div>

          <div className="mt-3.5">
            <label htmlFor={`${panelId}-image`} className="mb-1.5 block text-[11px] font-bold text-slate-300">
              Gambar profil (opsional)
            </label>
            <input
              id={`${panelId}-image`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) readImageFile(file);
              }}
              className="w-full text-[11px] text-slate-300 file:mr-2 file:rounded-md file:border file:border-slate-500 file:bg-slate-800 file:px-2.5 file:py-1.5 file:text-slate-200"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">PNG, JPG, atau WebP · maksimal 512 KB.</p>
              <button
                type="button"
                onClick={() => onChange({ profileImage: '' })}
                className="shrink-0 text-xs text-sky-300 underline hover:text-white"
              >
                Hapus gambar
              </button>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <label htmlFor={`${panelId}-color`} className="flex items-center gap-2 rounded-[.65rem] border border-slate-700 bg-slate-800 p-[.45rem]">
              <input
                id={`${panelId}-color`}
                type="color"
                value={isHexColor(value.profileIconColor) ? value.profileIconColor : profileDefaults(type).profileIconColor}
                onChange={(event) => onChange({ profileIconColor: event.target.value })}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="min-w-0 text-[11px] text-slate-300">Warna ikon</span>
            </label>
            <label htmlFor={`${panelId}-bg`} className="flex items-center gap-2 rounded-[.65rem] border border-slate-700 bg-slate-800 p-[.45rem]">
              <input
                id={`${panelId}-bg`}
                type="color"
                value={isHexColor(value.profileIconBg) ? value.profileIconBg : profileDefaults(type).profileIconBg}
                onChange={(event) => onChange({ profileIconBg: event.target.value })}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="min-w-0 text-[11px] text-slate-300">Latar profil</span>
            </label>
          </div>

          <div className="mt-3.5" aria-live="polite" aria-atomic="true">
            <p className="text-[11px] leading-relaxed text-slate-400" role="status">
              Pratinjau {type === 'edge' ? 'garis hubungan' : 'objek'}: {appearance}. Perubahan profil diterapkan saat “Simpan Perubahan” pada editor objek ditekan.
            </p>
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-700 pt-2.5">
            <button
              type="button"
              onClick={() => onChange(profileDefaults(type))}
              className="inline-flex items-center gap-1.5 rounded-[.6rem] border border-slate-600 px-2.5 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
            >
              <i className="fas fa-rotate-left" aria-hidden="true" /> Reset profil
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="inline-flex items-center gap-1.5 rounded-[.6rem] border border-blue-500 bg-blue-600 px-2.5 py-2 text-[11px] font-bold text-white hover:bg-blue-500"
            >
              <i className="fas fa-check" aria-hidden="true" /> Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
