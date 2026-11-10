/**
 * Accessible modal shell shared by every dialog in the app.
 *
 * Behaviour ported from the legacy overlays: Escape closes, the panel traps Tab
 * focus, focus is restored to the opener on close, and the backdrop can be
 * clicked away unless the caller opts out (forms with unsaved input do).
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Open modals in registration order. Only the topmost one reacts to Escape or
 * intercepts Tab, so a confirmation dialog stacked over a modal closes alone
 * instead of tearing down both.
 */
const modalStack: symbol[] = [];

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class for the panel. */
  widthClass?: string;
  /** Extra classes applied to the panel element. */
  panelClassName?: string;
  /** Rendered below the body, inside the panel. */
  footer?: ReactNode;
  /** Whether a backdrop click closes the dialog (default true). */
  closeOnBackdrop?: boolean;
  /** Hides the header (used by fullscreen editors that draw their own chrome). */
  hideHeader?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = 'max-w-3xl',
  panelClassName = '',
  footer,
  closeOnBackdrop = true,
  hideHeader = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Latest-ref: the effect below must not re-run on every parent render, or it
  // would steal focus from inputs on each keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const trapTab = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    modalStack.push(token);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab') trapTab(event);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = modalStack.indexOf(token);
      if (index !== -1) modalStack.splice(index, 1);
      restoreFocusRef.current?.focus();
    };
  }, [open, trapTab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full items-start justify-center overflow-y-auto p-4 sm:p-8">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className={`panel-surface w-full ${widthClass} shadow-2xl ${panelClassName}`}
        >
          {!hideHeader && (
            <header className="flex items-center justify-between gap-4 border-b border-slate-700/80 px-5 py-3">
              <h2 className="text-base font-bold text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-red-700 hover:text-white"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </header>
          )}
          <div className="px-5 py-4">{children}</div>
          {footer && <footer className="border-t border-slate-700/80 px-5 py-3">{footer}</footer>}
        </div>
      </div>
    </div>
  );
}
