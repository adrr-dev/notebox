/**
 * Application shell: boots the workspace from the backend, mounts the 3D canvas
 * and wires every surface (panels, modals, overlays) together.
 */
import { useEffect } from 'react';
import { DataIOModal } from './features/dataio/DataIOModal';
import { EditorModal } from './features/editor/EditorModal';
import { GlobalVarsModal } from './features/formula/GlobalVarsModal';
import { startRecomputeBridge } from './features/formula/recomputeBridge';
import { Hud } from './features/hud/Hud';
import { ObjectListPanel } from './features/list/ObjectListPanel';
import { Minimap } from './features/minimap/Minimap';
import { SearchOverlay } from './features/search/SearchOverlay';
import { SpaceSettingsModal } from './features/settings/SpaceSettingsModal';
import { MathEvaluatorModal } from './features/tools/MathEvaluatorModal';
import { SyntaxDictionaryModal } from './features/tools/SyntaxDictionaryModal';
import { TrashModal } from './features/trash/TrashModal';
import { ViewModal } from './features/view/ViewModal';
import { useAppStore } from './store/appStore';
import { useUiStore } from './store/uiStore';
import { GraphCanvas } from './three/GraphCanvas';
import { engine } from './three/engine';
import { ConfirmDialogHost } from './ui/ConfirmDialog';
import { DeleteChoiceDialogHost } from './ui/DeleteChoiceDialog';
import { Toasts } from './ui/Toasts';
import { useGlobalShortcuts } from './ui/useGlobalShortcuts';
import { VerticalToolbar } from './ui/VerticalToolbar';

function BootScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950">
      <div className="panel-surface max-w-md p-6 text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase">Ruang Informasi 3D</p>
        {error ? (
          <>
            <h1 className="mt-2 text-lg font-bold text-red-300">Tidak dapat memuat ruang kerja</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{error}</p>
            <p className="mt-2 text-xs text-slate-400">
              Pastikan server lokal berjalan (<code className="text-slate-200">make dev-backend</code> atau{' '}
              <code className="text-slate-200">go run ./cmd/ri3d-server</code>).
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Coba lagi
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-lg font-bold text-white">Menyiapkan ruang…</h1>
            <p className="mt-2 text-sm text-slate-400">
              <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden="true" />
              Memuat workspace dari server lokal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SaveStatusPill() {
  const saveState = useAppStore((state) => state.saveState);
  const lastSavedAt = useAppStore((state) => state.lastSavedAt);
  const saveError = useAppStore((state) => state.saveError);

  const label =
    saveState === 'saving'
      ? 'Menyimpan…'
      : saveState === 'error'
        ? `Gagal menyimpan${saveError ? `: ${saveError}` : ''}`
        : lastSavedAt
          ? `Tersimpan ${new Date(lastSavedAt).toLocaleTimeString('id-ID')}`
          : 'Belum ada perubahan';
  const tone =
    saveState === 'error' ? 'text-red-300' : saveState === 'saving' ? 'text-amber-200' : 'text-slate-400';

  return (
    <p
      role="status"
      aria-live="polite"
      className={`panel-surface pointer-events-none fixed top-4 right-4 z-20 px-3 py-1.5 text-[11px] font-semibold ${tone}`}
    >
      {label}
    </p>
  );
}

export default function App() {
  const status = useAppStore((state) => state.status);
  const bootError = useAppStore((state) => state.bootError);
  const snapEnabled = useUiStore((state) => state.snapEnabled);
  useGlobalShortcuts();

  useEffect(() => {
    void useAppStore.getState().boot();
  }, []);

  useEffect(() => {
    const stopBridge = startRecomputeBridge();
    return stopBridge;
  }, []);

  useEffect(() => {
    engine.setSnapEnabled(snapEnabled);
  }, [snapEnabled]);

  if (status !== 'ready') {
    return (
      <BootScreen
        error={status === 'error' ? (bootError ?? 'Kesalahan tidak dikenal.') : null}
        onRetry={() => void useAppStore.getState().boot()}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <GraphCanvas />
      <VerticalToolbar />
      <ObjectListPanel />
      <Hud />
      <Minimap />
      <SaveStatusPill />

      <EditorModal />
      <ViewModal />
      <SearchOverlay />
      <TrashModal />
      <DataIOModal />
      <SpaceSettingsModal />
      <SyntaxDictionaryModal />
      <MathEvaluatorModal />
      <GlobalVarsModal />

      <Toasts />
      <ConfirmDialogHost />
      <DeleteChoiceDialogHost />
    </div>
  );
}
