/**
 * Promise-based confirmation dialog.
 *
 * Usage: `if (await confirmDialog({ message: '…' })) { … }`.
 * Mount <ConfirmDialogHost /> once, near the app root.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger' | 'warning';
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Opens the dialog and resolves with the user's decision. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (pending) {
    // A second request supersedes the first: resolve it as cancelled.
    pending.resolve(false);
  }
  const { promise, resolve } = Promise.withResolvers<boolean>();
  pending = { options, resolve };
  emit();
  return promise;
}

function settle(confirmed: boolean) {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(confirmed);
}

const TONE_CONFIRM: Record<NonNullable<ConfirmOptions['tone']>, string> = {
  default: 'bg-blue-600 hover:bg-blue-500',
  danger: 'bg-red-700 hover:bg-red-600',
  warning: 'bg-amber-600 hover:bg-amber-500',
};

/** Renders the active confirm request, if any. */
export function ConfirmDialogHost(): ReactElement | null {
  const [current, setCurrent] = useState<PendingConfirm | null>(pending);

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
  const tone = options.tone ?? 'default';

  return (
    <Modal
      open
      onClose={() => settle(false)}
      title={options.title ?? 'Konfirmasi'}
      widthClass="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => settle(false)}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            {options.cancelText ?? 'Batal'}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${TONE_CONFIRM[tone]}`}
          >
            {options.confirmText ?? 'Lanjutkan'}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-200">{options.message}</p>
    </Modal>
  );
}
