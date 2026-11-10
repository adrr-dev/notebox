/**
 * Trash / history modal.
 *
 * Ports the legacy trash list (legacy L12542-12707 + markup L5348-5379):
 * restore (blocked when the ID collides with an active object), permanent
 * purge, and emptying the whole bin, each behind a confirmation.
 */
import { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { Modal } from '../../ui/Modal';
import type { TrashItem } from '../../types/model';

/** legacy L6392 */
function formatDate(ts?: number): string {
  if (!ts) return 'Tidak diketahui';
  return new Date(ts).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TrashModal() {
  const trashOpen = useUiStore((state) => state.trashOpen);
  const close = useUiStore((state) => state.close);
  const trash = useAppStore((state) => state.trash);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const restoreTrashItem = useAppStore((state) => state.restoreTrashItem);
  const purgeTrashItem = useAppStore((state) => state.purgeTrashItem);
  const emptyTrash = useAppStore((state) => state.emptyTrash);

  // Newest first, but each row keeps its original store index for the actions.
  const rows = useMemo(
    () => trash.map((item, index) => ({ item, index })).sort((a, b) => b.item.deletedAt - a.item.deletedAt),
    [trash],
  );
  const activeIds = useMemo(
    () => new Set([...nodes.map((node) => String(node.id)), ...edges.map((edge) => String(edge.id))]),
    [nodes, edges],
  );

  const onPurge = async (item: TrashItem, index: number) => {
    const confirmed = await confirmDialog({
      title: 'Hapus permanen',
      message: `Hapus permanen “${item.data.title || 'Tanpa Judul'}”? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus permanen',
      tone: 'danger',
    });
    if (confirmed) purgeTrashItem(index);
  };

  const onEmpty = async () => {
    const confirmed = await confirmDialog({
      title: 'Kosongkan tempat sampah',
      message: 'Kosongkan tempat sampah? Semua arsip di dalamnya akan dihapus permanen.',
      confirmText: 'Kosongkan',
      tone: 'danger',
    });
    if (confirmed) emptyTrash();
  };

  return (
    <Modal
      open={trashOpen}
      onClose={() => close('trash')}
      title="Log Histori & Tempat Sampah"
      widthClass="max-w-2xl"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/50 p-3">
        <span className="text-xs text-slate-400">{trash.length} arsip di tempat sampah.</span>
        <button
          type="button"
          onClick={onEmpty}
          disabled={trash.length === 0}
          className="rounded-lg border border-red-700/50 bg-red-900/50 px-4 py-2 text-xs font-bold text-red-300 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <i className="fas fa-trash-alt mr-1" aria-hidden="true" />Kosongkan tempat sampah
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-sm font-bold text-slate-500">
          Histori bersih. Tidak ada data terarsip.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(({ item, index }) => {
            const id = String(item.data.id);
            const collision = activeIds.has(id);
            return (
              <div
                key={`${id}-${index}`}
                className="flex items-center gap-4 rounded-xl border border-slate-600 bg-slate-800/80 p-4"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
                  <i
                    className={`fas ${
                      item.objType === 'node' ? 'fa-cube text-blue-400' : 'fa-project-diagram text-orange-400'
                    } text-xl`}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">
                    {item.data.title || 'Tanpa Judul'}
                  </div>
                  <div className="mt-1 text-[10px] font-bold tracking-wide text-slate-400">
                    <i className="far fa-clock mr-1" aria-hidden="true" />Dihapus: {formatDate(item.deletedAt)}
                  </div>
                  {collision && (
                    <div className="mt-1 text-[10px] text-amber-300">
                      ID objek masih dipakai objek aktif; pemulihan dinonaktifkan.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => restoreTrashItem(index)}
                    disabled={collision}
                    title={collision ? 'ID objek masih dipakai objek aktif' : 'Pulihkan'}
                    className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white shadow transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <i className="fas fa-undo mr-1" aria-hidden="true" />Pulihkan
                  </button>
                  <button
                    type="button"
                    onClick={() => void onPurge(item, index)}
                    title="Hapus permanen"
                    className="rounded-lg border border-red-700 bg-red-900/80 px-4 py-2 text-xs font-bold text-red-300 shadow transition-colors hover:bg-red-600 hover:text-white"
                  >
                    <i className="fas fa-fire mr-1" aria-hidden="true" />Hapus permanen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
