/**
 * Attachment rows for the object editor.
 *
 * Ported from the legacy attachment block (markup L4160-4180, logic
 * L7562-7628): name/url/type rows, local file upload stored as a data URL,
 * automatic type detection and the 24 Mi-character attachment ceiling.
 */
import { useAppStore } from '../../store/appStore';
import { MAX_INLINE_ATTACHMENT_CHARS } from './richTextHtml';
import type { Attachment } from '../../types/model';

export type AttachmentType = 'none' | 'file' | 'image' | 'video' | 'audio' | 'document';

const TYPE_LABELS: Record<string, string> = {
  none: 'Belum ditentukan',
  file: 'Berkas',
  image: 'Gambar',
  video: 'Video',
  audio: 'Audio',
  document: 'Dokumen / tautan',
};

/** Effective byte budget of a base64 data URL inside the 24 Mi-character cap. */
function maxRawAttachmentBytes(): number {
  return Math.floor((MAX_INLINE_ATTACHMENT_CHARS - 256) * 3 / 4);
}

/** Type from a stored URL, matching the legacy extension sniffing (L7562-7571). */
export function detectTypeFromUrl(url: string): AttachmentType {
  if (!url) return 'document';
  if (/^blob:|^data:/.test(url)) {
    if (/^data:image\//i.test(url)) return 'image';
    if (/^data:video\//i.test(url)) return 'video';
    if (/^data:audio\//i.test(url)) return 'audio';
    return 'file';
  }
  const lower = url.toLowerCase();
  if (lower.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/)) return 'image';
  if (lower.match(/\.(mp4|webm|ogg)(\?.*)?$/)) return 'video';
  if (lower.match(/\.(mp3|wav|ogg)(\?.*)?$/)) return 'audio';
  return 'document';
}

/** Type accepted for a locally uploaded file; empty string means unsupported. */
function detectTypeFromFile(file: File): AttachmentType | '' {
  const mime = String(file.type || '').toLowerCase().split(';')[0].trim();
  if (/^image\/(?:png|jpeg|gif|webp)$/.test(mime)) return 'image';
  if (/^audio\/(?:mpeg|ogg|wav|webm|mp4|aac)$/.test(mime)) return 'audio';
  if (/^video\/(?:mp4|webm|ogg)$/.test(mime)) return 'video';
  if (
    /^(?:application\/(?:pdf|octet-stream|zip|json|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[a-z0-9.+-]+)|text\/(?:plain|csv|markdown))$/.test(
      mime,
    )
  ) {
    return mime === 'application/octet-stream' || mime === 'application/zip' ? 'file' : 'document';
  }
  if (!mime) return 'file'; /* Empty MIME is represented as a passive binary attachment. */
  return '';
}

export interface AttachmentsEditorProps {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
}

export function AttachmentsEditor({ attachments, onChange }: AttachmentsEditorProps) {
  const pushToast = useAppStore((state) => state.pushToast);

  const updateRow = (index: number, patch: Partial<Attachment>) => {
    onChange(attachments.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const readUpload = (index: number, file: File) => {
    const detected = detectTypeFromFile(file);
    if (!detected) {
      pushToast(
        'Jenis berkas lokal ini tidak didukung untuk penyimpanan mandiri. Gunakan PDF, teks/CSV/JSON, raster PNG/JPEG/GIF/WebP, audio/video yang didukung, atau tautan HTTPS.',
        'error',
      );
      return;
    }
    const maxBytes = maxRawAttachmentBytes();
    if (file.size > maxBytes) {
      pushToast(
        `Berkas terlalu besar untuk disimpan mandiri sebagai lampiran ${detected}: ${(file.size / (1024 * 1024)).toFixed(1)} MiB. Batas efektif sekitar ${(maxBytes / (1024 * 1024)).toFixed(1)} MiB; gunakan tautan HTTPS atau berkas lebih kecil.`,
        'error',
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      updateRow(index, {
        url: reader.result,
        type: detected,
        name: attachments[index]?.name?.trim() ? attachments[index].name : file.name,
      });
    };
    reader.onerror = () => pushToast('Berkas lampiran gagal dibaca.', 'error');
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 shadow-inner">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          <i className="fas fa-paperclip mr-2 text-blue-400" aria-hidden="true" />
          Lampiran
        </span>
        <button
          type="button"
          onClick={() => onChange([...attachments, { name: '', url: '', type: 'none' }])}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-500"
        >
          <i className="fas fa-plus mr-1" aria-hidden="true" /> Tambah lampiran
        </button>
      </div>

      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 p-3 text-[11px] italic text-slate-500">
          Belum ada lampiran pada objek ini.
        </p>
      ) : (
        <div className="flex max-h-60 flex-col gap-3 overflow-y-auto pr-2">
          {attachments.map((attachment, index) => {
            const type = (attachment.type as AttachmentType | undefined) ?? 'none';
            return (
              <div
                key={`${index}-${attachment.url.slice(0, 24)}`}
                className="flex flex-col items-center gap-3 rounded-xl border border-slate-600 bg-slate-800 p-3 md:flex-row"
              >
                <div className="grid w-full flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <i className="fas fa-heading absolute left-3 top-3 text-[10px] text-slate-500" aria-hidden="true" />
                    <input
                      type="text"
                      value={attachment.name}
                      aria-label={`Judul lampiran ${index + 1}`}
                      placeholder="Judul File / Media"
                      onChange={(event) => updateRow(index, { name: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-xs text-white outline-none transition-colors focus:border-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      className="hidden"
                      id={`attachment-file-${index}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) readUpload(index, file);
                      }}
                    />
                    <button
                      type="button"
                      title="Unggah File Lokal"
                      aria-label={`Unggah berkas lokal untuk lampiran ${index + 1}`}
                      onClick={() => document.getElementById(`attachment-file-${index}`)?.click()}
                      className="rounded-lg border border-slate-600 bg-slate-700 px-3 text-xs text-white transition-colors hover:bg-slate-600"
                    >
                      <i className="fas fa-upload" aria-hidden="true" />
                    </button>
                    <div className="relative flex-1">
                      <i className="fas fa-link absolute left-3 top-3 text-[10px] text-slate-500" aria-hidden="true" />
                      <input
                        type="url"
                        value={attachment.url}
                        aria-label={`URL lampiran ${index + 1}`}
                        placeholder="Atau Tempel Tautan URL..."
                        onChange={(event) => updateRow(index, { url: event.target.value, type: detectTypeFromUrl(event.target.value) })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-xs text-white outline-none transition-colors focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-slate-600 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                  {TYPE_LABELS[type] ?? type}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(attachments.filter((_, i) => i !== index))}
                  aria-label={`Hapus lampiran ${index + 1}`}
                  className="flex h-10 w-full items-center justify-center rounded-lg border border-red-700/50 bg-red-900/50 text-red-400 transition-colors hover:bg-red-600 hover:text-white md:w-10"
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
