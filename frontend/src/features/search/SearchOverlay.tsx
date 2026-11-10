/**
 * Full-text search command palette.
 *
 * Ports the legacy search (legacy L23961-24034): live results over nodes and
 * edges (title, description and pages as plain text, labels, attachment names),
 * capped at 100 hits, with ↑/↓/Enter navigation and match highlighting.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { engine } from '../../three/engine';
import { ProfileAvatar } from '../editor/ProfileIconPicker';
import { highlightHtml, identityOf, plainText } from '../view/viewPages';
import type { EdgeRecord, EntityID, NodeRecord } from '../../types/model';

interface Hit {
  type: 'node' | 'edge';
  id: EntityID;
  record: NodeRecord | EdgeRecord;
  title: string;
  labels: string[];
  excerpt: string;
}

/** legacy L12701 normalizeWorkspaceSearch */
function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id');
}

/** Window of plain text around the first match, for the result line. */
function excerptOf(record: NodeRecord | EdgeRecord, query: string): string {
  const sources: string[] = [record.title || '', plainText(record.desc)];
  if (record.pageTitle) sources.push(record.pageTitle);
  for (const page of record.pages ?? []) sources.push(page.title || '', plainText(page.desc));
  const attachments = (record.attachments ?? []).map((attachment) => attachment.name);

  const needle = query.toLowerCase();
  const found = [...sources, ...attachments].find((text) => text.toLowerCase().includes(needle));
  const text = String(found ?? sources[1] ?? sources[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) return text.slice(0, 140);
  const start = Math.max(0, index - 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 160)}`;
}

export function SearchOverlay() {
  const searchOpen = useUiStore((state) => state.searchOpen);
  const close = useUiStore((state) => state.close);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const openViewer = useAppStore((state) => state.openViewer);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeSearch = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    close('search');
  }, [close]);

  useEffect(() => {
    if (!searchOpen) return;
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, closeSearch]);

  const hits = useMemo<Hit[]>(() => {
    const needle = normalizeSearch(query);
    if (!needle) return [];
    const pools: { type: 'node' | 'edge'; record: NodeRecord | EdgeRecord }[] = [
      ...nodes.map((node) => ({ type: 'node' as const, record: node })),
      ...edges.map((edge) => ({ type: 'edge' as const, record: edge })),
    ];
    const results: Hit[] = [];
    for (const { type, record } of pools) {
      const labels = record.labels ?? [];
      const haystack = [
        record.title || '',
        plainText(record.desc),
        record.pageTitle || '',
        ...(record.pages ?? []).flatMap((page) => [page.title || '', plainText(page.desc)]),
        ...labels,
        ...(record.attachments ?? []).map((attachment) => attachment.name),
      ]
        .map(normalizeSearch)
        .join('\n');
      if (!haystack.includes(needle)) continue;
      results.push({
        type,
        id: record.id,
        record,
        title: record.title || (type === 'node' ? 'Objek tanpa judul' : 'Relasi tanpa judul'),
        labels,
        excerpt: excerptOf(record, query),
      });
      if (results.length >= 100) break;
    }
    return results;
  }, [nodes, edges, query]);

  if (!searchOpen) return null;

  const active = hits[Math.min(activeIndex, Math.max(0, hits.length - 1))];
  const trimmed = query.trim();
  const status = !trimmed
    ? ''
    : hits.length
      ? `${hits.length} hasil ditemukan.`
      : 'Tidak ada hasil. Coba judul, catatan, nama halaman, atau label lain.';

  const openHit = (hit: Hit) => {
    engine.flyToObject(hit.type, hit.id);
    openViewer(hit.type, hit.id);
    closeSearch();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, hits.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active) openHit(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pencarian informasi"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSearch();
      }}
    >
      <div className="mx-auto mt-24 w-full max-w-xl px-4">
        <div className="overflow-hidden rounded-2xl border border-slate-600 bg-slate-800/95 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-700 px-3">
            <i className="fas fa-search text-slate-400" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Cari judul, catatan, halaman, atau label..."
              aria-label="Cari informasi dalam workspace"
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls="search-overlay-results"
              className="w-full bg-transparent py-3 text-sm text-white outline-none"
            />
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          {trimmed && (
            <div
              id="search-overlay-results"
              role="listbox"
              aria-label="Hasil pencarian informasi"
              className="max-h-80 overflow-y-auto"
            >
              {hits.length === 0 ? (
                <div className="p-5 text-center text-xs font-bold text-slate-400">
                  Tidak ditemukan dalam judul, deskripsi, halaman, label, atau lampiran.
                </div>
              ) : (
                hits.map((hit, index) => (
                  <button
                    key={`${hit.type}-${hit.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openHit(hit)}
                    className={`flex w-full items-center gap-3 border-b border-slate-700/50 p-3 text-left transition-colors ${
                      index === activeIndex ? 'bg-slate-700/80' : 'hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="block h-9 w-9 shrink-0">
                      <ProfileAvatar visual={identityOf(hit.record, hit.type)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-bold text-white"
                        dangerouslySetInnerHTML={{ __html: highlightHtml(hit.title, query) }}
                      />
                      <span className="block truncate text-[10px] text-slate-400">
                        {hit.type === 'node' ? 'Objek' : 'Relasi'} · {hit.labels.join(', ') || 'tanpa label'}
                      </span>
                      <span
                        className="block truncate font-mono text-[11px] text-cyan-200/90"
                        dangerouslySetInnerHTML={{ __html: highlightHtml(hit.excerpt, query) }}
                      />
                    </span>
                  </button>
                ))
              )}
              {hits.length >= 100 && (
                <div className="p-2 text-center text-[10px] text-slate-400">
                  Menampilkan 100 hasil pertama. Persempit kata pencarian.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
