/**
 * Keyboard shortcuts, mirroring the legacy binding set:
 * 1–4 tools, N new object, / or Ctrl+K search, M minimap, Esc close,
 * Ctrl+S save.
 */
import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { anySurfaceOpen, useUiStore } from '../store/uiStore';
import type { ToolMode } from '../types/model';

const TOOL_KEYS: Record<string, ToolMode> = {
  '1': 'pointer',
  '2': 'move',
  '3': 'connect',
  '4': 'delete',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const app = useAppStore.getState();
      const ui = useUiStore.getState();

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void app.saveNow('shortcut');
        app.pushToast('Menyimpan workspace…', 'info');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.open('search');
        return;
      }
      if (event.key === 'Escape') {
        if (anySurfaceOpen(ui)) {
          ui.closeAll();
          return;
        }
        if (app.editing) {
          app.closeEditor();
          return;
        }
        if (app.viewing) {
          app.closeViewer();
          return;
        }
        app.setFocus(null);
        return;
      }
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

      const tool = TOOL_KEYS[event.key];
      if (tool) {
        app.setMode(tool);
        return;
      }
      switch (event.key.toLowerCase()) {
        case 'n':
          app.openEditor('node', null);
          return;
        case '/':
          event.preventDefault();
          ui.open('search');
          return;
        case 'm':
          ui.setMinimapVisible(!ui.minimapVisible);
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
