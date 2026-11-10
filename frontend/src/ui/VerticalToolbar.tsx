/**
 * Left tool rail: the four interaction modes plus the tool drawer
 * (legacy `#vertical-toolbar` + `#extra-tools`).
 */
import { useAppStore } from '../store/appStore';
import { useUiStore } from '../store/uiStore';
import { engine } from '../three/engine';
import type { ToolMode } from '../types/model';

interface ToolDefinition {
  id: ToolMode;
  icon: string;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDefinition[] = [
  { id: 'pointer', icon: 'fa-hand-pointer', label: 'Pointer (Buka Info)', shortcut: '1' },
  { id: 'move', icon: 'fa-up-down-left-right', label: 'Pindah Objek (Geser)', shortcut: '2' },
  { id: 'connect', icon: 'fa-link', label: 'Hubungkan Garis', shortcut: '3' },
  { id: 'delete', icon: 'fa-trash-can', label: 'Hapus Objek / Garis', shortcut: '4' },
];

export function VerticalToolbar() {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const openEditor = useAppStore((state) => state.openEditor);
  const connectSourceId = useAppStore((state) => state.connectSourceId);
  const snapEnabled = useUiStore((state) => state.snapEnabled);
  const toggleSnap = useUiStore((state) => state.toggleSnap);
  const toolsExpanded = useUiStore((state) => state.toolsExpanded);
  const setToolsExpanded = useUiStore((state) => state.setToolsExpanded);
  const open = useUiStore((state) => state.open);
  const minimapVisible = useUiStore((state) => state.minimapVisible);
  const setMinimapVisible = useUiStore((state) => state.setMinimapVisible);

  return (
    <div
      id="vertical-toolbar"
      className="fixed top-4 left-4 z-20 flex max-h-[calc(100vh-2rem)] flex-col gap-2 overflow-y-auto"
    >
      <div className="panel-surface flex flex-col gap-2 p-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            title={`${tool.label} · ${tool.shortcut}`}
            aria-label={tool.label}
            aria-pressed={mode === tool.id}
            className={`tool-btn ${mode === tool.id ? 'active' : ''}`}
            onClick={() => setMode(tool.id)}
          >
            <i className={`fas ${tool.icon}`} aria-hidden="true" />
          </button>
        ))}
        {mode === 'connect' && connectSourceId !== null && (
          <span className="text-center text-[10px] font-bold text-amber-300" role="status">
            <i className="fas fa-circle-notch fa-spin mr-1" aria-hidden="true" />
            pilih tujuan
          </span>
        )}
        <button
          type="button"
          title="Buat objek baru (N)"
          aria-label="Buat objek baru"
          className="tool-btn"
          onClick={() => openEditor('node', null)}
        >
          <i className="fas fa-plus" aria-hidden="true" />
        </button>
      </div>

      <div className="panel-surface flex flex-col gap-2 p-2">
        <button
          type="button"
          title="Alat tambahan"
          aria-label="Alat tambahan"
          aria-expanded={toolsExpanded}
          className={`tool-btn ${toolsExpanded ? 'active' : ''}`}
          onClick={() => setToolsExpanded(!toolsExpanded)}
        >
          <i className={`fas fa-chevron-${toolsExpanded ? 'up' : 'down'}`} aria-hidden="true" />
        </button>

        {toolsExpanded && (
          <div id="extra-tools" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              title="Magnet Presisi (Snap-to-Grid)"
              aria-label="Magnet presisi"
              aria-pressed={snapEnabled}
              className={`tool-btn ${snapEnabled ? 'active' : ''}`}
              onClick={() => {
                toggleSnap();
                engine.setSnapEnabled(!snapEnabled);
              }}
            >
              <i className="fas fa-magnet" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Pengaturan Ruang (Grid & Lingkup)"
              aria-label="Pengaturan ruang"
              className="tool-btn"
              onClick={() => open('spaceSettings')}
            >
              <i className="fas fa-border-all" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Susun Otomatis (Kisi)"
              aria-label="Susun otomatis"
              className="tool-btn"
              onClick={() => engine.autoArrange()}
            >
              <i className="fas fa-layer-group" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Paskan Pandangan ke Semua Objek"
              aria-label="Paskan pandangan"
              className="tool-btn"
              onClick={() => engine.zoomToFit()}
            >
              <i className="fas fa-expand" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Kamus Referensi Sintaks (LaTeX)"
              aria-label="Kamus sintaks LaTeX"
              className="tool-btn"
              onClick={() => open('syntaxDict')}
            >
              <i className="fas fa-square-root-variable" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Kalkulator mathjs"
              aria-label="Kalkulator mathjs"
              className="tool-btn"
              onClick={() => open('mathEvaluator')}
            >
              <i className="fas fa-calculator" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Variabel global & dependensi"
              aria-label="Variabel global"
              className="tool-btn"
              onClick={() => open('globalVars')}
            >
              <i className="fas fa-diagram-project" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Ekspor / Impor / Bagikan Data"
              aria-label="Ekspor atau impor data"
              className="tool-btn"
              onClick={() => open('dataIo')}
            >
              <i className="fas fa-file-import" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Histori & Tempat Sampah"
              aria-label="Histori dan tempat sampah"
              className="tool-btn"
              onClick={() => open('trash')}
            >
              <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Peta mini (M)"
              aria-label="Peta mini"
              aria-pressed={minimapVisible}
              className={`tool-btn ${minimapVisible ? 'active' : ''}`}
              onClick={() => setMinimapVisible(!minimapVisible)}
            >
              <i className="fas fa-map" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Reset Pandangan (Ke Beranda)"
              aria-label="Reset pandangan"
              className="tool-btn"
              onClick={() => engine.resetCamera()}
            >
              <i className="fas fa-house" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Cari objek (Ctrl+K)"
              aria-label="Cari objek"
              className="tool-btn"
              onClick={() => open('search')}
            >
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
