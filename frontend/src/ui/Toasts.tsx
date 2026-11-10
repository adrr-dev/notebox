/**
 * Toast stack. Reads the message queue from the app store and renders it as a
 * polite live region so screen readers announce feedback without stealing focus.
 */
import { useAppStore } from '../store/appStore';
import type { ToastMessage } from '../store/appStore';

const KIND_STYLES: Record<ToastMessage['kind'], { container: string; icon: string }> = {
  info: { container: 'border-sky-500/50 bg-sky-950/90 text-sky-100', icon: 'fa-circle-info text-sky-300' },
  success: {
    container: 'border-emerald-500/50 bg-emerald-950/90 text-emerald-100',
    icon: 'fa-circle-check text-emerald-300',
  },
  error: { container: 'border-red-500/60 bg-red-950/90 text-red-100', icon: 'fa-triangle-exclamation text-red-300' },
};

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,32rem)] -translate-x-1/2 flex-col gap-2"
      id="toast"
    >
      {toasts.map((toast) => {
        const style = KIND_STYLES[toast.kind];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${style.container}`}
          >
            <i className={`fas ${style.icon} mt-0.5`} aria-hidden="true" />
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup notifikasi"
              className="text-current opacity-70 hover:opacity-100"
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
