/**
 * Collapsible object list.
 *
 * Ports the legacy list panel (legacy L12727-12839): sort, label filter, text
 * filter over title/description/pages/labels, and rows that fly to and open an
 * object. Filtering is memoized so typing stays cheap on large workspaces.
 */
import { useMemo, useState } from 'react';
import { useAppStore, collectLabels } from '../../store/appStore';
import { engine } from '../../three/engine';
import { ProfileAvatar } from '../editor/ProfileIconPicker';
import { identityOf, plainText } from '../view/viewPages';
import type { EdgeRecord, EntityID, NodeRecord } from '../../types/model';

type SortKey = 'name' | 'newest' | 'lastAccessed';

interface ListRow {
  type: 'node' | 'edge';
  id: EntityID;
  title: string;
  labels: string[];
  createdAt?: number;
  lastAccessed?: number;
  record: NodeRecord | EdgeRecord;
  connections: number;
}

/** legacy L12701 normalizeWorkspaceSearch */
function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id');
}

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

export function ObjectListPanel() {
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const labelOptions = useMemo(() => collectLabels(nodes, edges), [nodes, edges]);
  const openViewer = useAppStore((state) => state.openViewer);

  const [collapsed, setCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [labelFilter, setLabelFilter] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo<ListRow[]>(() => {
    const degree = new Map<string, number>();
    for (const edge of edges) {
      for (const end of [edge.sourceId, edge.targetId]) {
        const key = String(end);
        degree.set(key, (degree.get(key) ?? 0) + 1);
      }
    }
    const all: ListRow[] = [
      ...nodes.map((node) => ({
        type: 'node' as const,
        id: node.id,
        title: node.title,
        labels: node.labels ?? [],
        createdAt: node.createdAt,
        lastAccessed: node.lastAccessed,
        record: node,
        connections: degree.get(String(node.id)) ?? 0,
      })),
      ...edges.map((edge) => ({
        type: 'edge' as const,
        id: edge.id,
        title: edge.title,
        labels: edge.labels ?? [],
        createdAt: edge.createdAt,
        lastAccessed: edge.lastAccessed,
        record: edge,
        connections: 2,
      })),
    ];
    const needle = normalizeSearch(query);
    const filtered = all.filter((row) => {
      if (labelFilter !== 'all' && !row.labels.includes(labelFilter)) return false;
      if (!needle) return true;
      const record = row.record;
      const haystack = [
        row.title,
        plainText(record.desc),
        record.pageTitle || '',
        ...(record.pages ?? []).flatMap((page) => [page.title || '', plainText(page.desc)]),
        ...row.labels,
      ]
        .map(normalizeSearch)
        .join('\n');
      return haystack.includes(needle);
    });
    filtered.sort((a, b) => {
      if (sortBy === 'name') return String(a.title).localeCompare(String(b.title), 'id');
      if (sortBy === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
    return filtered;
  }, [nodes, edges, sortBy, labelFilter, query]);

  return (
    <div className="pointer-events-auto absolute top-4 left-36 z-20 w-80 max-w-[calc(100vw-11rem)] rounded-xl border border-slate-600 bg-slate-900/95 shadow-2xl backdrop-blur">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
        aria-controls="object-list-body"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <i className="fas fa-list text-blue-400" aria-hidden="true" />
        <span className="flex-1 text-xs font-bold text-slate-100">Daftar objek dan garis</span>
        <i
          className={`fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px] text-slate-400`}
          aria-hidden="true"
        />
      </button>
      {!collapsed && (
        <div id="object-list-body" className="flex max-h-[60vh] flex-col">
          <div className="border-t border-slate-700/80 px-3 pt-2 pb-2">
            <p className="text-[10px] leading-relaxed text-slate-400">
              Telusuri seluruh isi ruang, lalu atur urutan atau saring menurut label.
            </p>
            <p className="mt-1 text-[10px] text-slate-500" aria-live="polite">
              {nodes.length} objek · {edges.length} garis
            </p>
          </div>
          <div className="flex flex-col gap-2 border-b border-slate-700 p-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Saring judul, catatan, halaman, atau label..."
              aria-label="Saring daftar objek dan garis"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortKey)}
                aria-label="Urutkan daftar objek dan garis"
                className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] font-medium text-slate-300 outline-none focus:border-blue-500"
              >
                <option value="name">Urutan: Nama (A-Z)</option>
                <option value="newest">Urutan: Terkini (Dibuat)</option>
                <option value="lastAccessed">Urutan: Terakhir Diakses</option>
              </select>
              <select
                value={labelFilter}
                onChange={(event) => setLabelFilter(event.target.value)}
                aria-label="Saring objek dan garis menurut label"
                className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] font-medium text-slate-300 outline-none focus:border-blue-500"
              >
                <option value="all">Label: Semua</option>
                {labelOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {rows.length === 0 ? (
              <div className="p-5 text-center text-xs font-bold text-slate-500">
                Belum ada item yang cocok dengan filter ini.
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={`${row.type}-${row.id}`}
                  type="button"
                  onClick={() => {
                    engine.focusObject(row.type, row.id);
                    openViewer(row.type, row.id);
                  }}
                  aria-label={`${row.type === 'node' ? 'Objek pengetahuan' : 'Garis hubungan'}: ${row.title || 'Tanpa judul'}`}
                  className="flex w-full items-center gap-3 rounded-lg border-b border-slate-700/50 p-2.5 text-left transition-colors hover:bg-slate-700/80 focus-visible:bg-slate-700/80 focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                  <span className="block h-9 w-9 shrink-0">
                    <ProfileAvatar visual={identityOf(row.record, row.type)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-white">
                      {row.title || '(Tanpa judul)'}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {row.type === 'node' ? 'Objek pengetahuan' : 'Garis hubungan'}
                    </span>
                    <span className="mt-1 block truncate text-[10px] font-semibold tracking-wide text-slate-400">
                      {row.labels.length ? `[${row.labels.join(', ')}] · ` : ''}
                      {row.connections} koneksi · {formatDate(row.createdAt)}
                    </span>
                  </span>
                  <i className="fas fa-chevron-right shrink-0 text-[10px] text-slate-500" aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
