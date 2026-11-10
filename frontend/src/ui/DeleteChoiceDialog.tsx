/**
 * Three-way delete prompt: archive (recoverable), permanent, or cancel.
 * Ported from the legacy "Hapus Informasi" modal that offered both archive and
 * permanent deletion (legacy markup L5122-5152).
 *
 * Usage: `const mode = await chooseDeleteMode('Objek “Judul”');`
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Modal } from './Modal';

export type DeleteMode = 'archive' | 'permanent';

export interface DeleteChoiceOptions {
  /** Object description shown in the dialog, e.g. `Objek “Judul”`. */
  subject: string;
  /** Extra note, e.g. that the object has attached relations. */
  note?: string;
}

interface PendingChoice {
  options: DeleteChoiceOptions;
  resolve: (mode: DeleteMode | null) => void;
}

let pending: PendingChoice | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function chooseDeleteMode(options: DeleteChoiceOptions): Promise<DeleteMode | null> {
  if (pending) pending.resolve(null);
  const { promise, resolve } = Promise.withResolvers<DeleteMode | null>();
  pending = { options, resolve };
  emit();
  return promise;
}

function settle(mode: DeleteMode | null) {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(mode);
}

export function DeleteChoiceDialogHost(): ReactElement | null {
  const [current, setCurrent] = useState<PendingChoice | null>(pending);

  useEffect(() => {
    const listener = () => setCurrent(pending);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!current) return null;
  const { options } = current;

  return (
    <Modal
      open
      onClose={() => settle(null)}
      title="Hapus informasi"
      widthClass="max-w-lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => settle(null)}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => settle('archive')}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            Arsipkan
          </button>
          <button
            type="button"
            onClick={() => settle('permanent')}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
          >
            Hapus permanen
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-slate-200">
        <p>
          {options.subject} akan dihapus dari ruang kerja.
        </p>
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-amber-100">
          <p className="font-semibold">Arsipkan</p>
          <p className="mt-1 text-xs">
            Objek dipindahkan ke Histori &amp; Tempat Sampah dan masih dapat dipulihkan.
          </p>
        </div>
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-red-100">
          <p className="font-semibold">Hapus permanen</p>
          <p className="mt-1 text-xs">
            Objek beserta garis yang menempel padanya dihapus tanpa dapat dipulihkan.
          </p>
        </div>
        {options.note && <p className="text-xs text-slate-400">{options.note}</p>}
      </div>
    </Modal>
  );
}
