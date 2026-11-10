/**
 * Ringkasan Markdown workspace ("laporan baca", bukan berkas pemulihan).
 *
 * Port dari `summary()` versi lama (legacy L13511-13591): hitungan per jenis
 * pengetahuan dan per relasi, daftar label, objek tanpa koneksi, lalu daftar
 * objek beserta tanggalnya. Seluruh teks keluaran berbahasa Indonesia.
 */
import { EPISTEMIC_KIND_LABELS, EPISTEMIC_STATUS_LABELS } from '../epistemic/schemaV2.catalog';
import { RELATION_LABEL_BY_VALUE } from '../graph/relationSymbols.data';
import type { EdgeRecord, NodeRecord } from '../../types/model';

/** Formats a timestamp the way the legacy report did (`id-ID`). */
function when(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID');
}

/** One entry per object: knowledge fields, dates and its connections. */
function nodeLines(node: NodeRecord, edges: EdgeRecord[], titleById: Map<string, string>): string[] {
  const id = String(node.id);
  const kind =
    (node.kind && EPISTEMIC_KIND_LABELS[node.kind as keyof typeof EPISTEMIC_KIND_LABELS]) ||
    node.kind ||
    'Tanpa jenis';
  const status = node.epistemicStatus
    ? EPISTEMIC_STATUS_LABELS[node.epistemicStatus as keyof typeof EPISTEMIC_STATUS_LABELS] ?? node.epistemicStatus
    : '';

  const lines: string[] = [`- **${String(node.title || 'Tanpa Judul')}** — ${[kind, status].filter(Boolean).join(' · ')}`];
  if ((node.labels ?? []).length > 0) lines.push(`  - Label: ${(node.labels ?? []).join(', ')}`);
  if (node.scope) lines.push(`  - Ruang lingkup: ${node.scope}`);
  if (node.mathExpression) lines.push(`  - Rumus: \`${node.mathExpression}\` = ${node.mathValue ?? ''}`);
  lines.push(`  - Dibuat: ${when(node.createdAt)} · Terakhir diakses: ${when(node.lastAccessed)}`);

  const outgoing = edges.filter((edge) => String(edge.sourceId) === id);
  const incoming = edges.filter((edge) => String(edge.targetId) === id);
  lines.push(`  - Koneksi: ${outgoing.length} keluar · ${incoming.length} masuk`);
  for (const edge of outgoing) {
    lines.push(
      `    - Keluar: ${String(edge.title || 'Koneksi Baru')} → ${titleById.get(String(edge.targetId)) ?? '(sudah dihapus)'}`,
    );
  }
  for (const edge of incoming) {
    lines.push(
      `    - Masuk: ${String(edge.title || 'Koneksi Baru')} ← ${titleById.get(String(edge.sourceId)) ?? '(sudah dihapus)'}`,
    );
  }
  return lines;
}

/** Builds the whole "Ringkasan Progress" document. */
export function buildMarkdownSummary(nodes: NodeRecord[], edges: EdgeRecord[]): string {
  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  // Only relations whose both endpoints travel inside the report are counted,
  // exactly like the legacy `pick()` scope (legacy L13405).
  const internalEdges = edges.filter(
    (edge) => nodeIds.has(String(edge.sourceId)) && nodeIds.has(String(edge.targetId)),
  );
  const titleById = new Map<string, string>(
    nodes.map((node) => [String(node.id), String(node.title || 'Tanpa Judul')]),
  );

  const kindCounts = new Map<string, number>();
  for (const node of nodes) {
    const kind =
      (node.kind && EPISTEMIC_KIND_LABELS[node.kind as keyof typeof EPISTEMIC_KIND_LABELS]) ||
      node.kind ||
      'Tanpa jenis';
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  const relationCounts = new Map<string, number>();
  for (const edge of internalEdges) {
    const relation =
      edge.relation && edge.relation !== 'none'
        ? RELATION_LABEL_BY_VALUE.get(String(edge.relation)) ?? String(edge.relation)
        : 'Garis Biasa (Tidak ada simbol)';
    relationCounts.set(relation, (relationCounts.get(relation) ?? 0) + 1);
  }

  const labels = [...new Set(nodes.flatMap((node) => (node.labels ?? []).map(String)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'id'),
  );

  const connected = new Set<string>();
  for (const edge of internalEdges) {
    connected.add(String(edge.sourceId));
    connected.add(String(edge.targetId));
  }
  const orphans = nodes.filter((node) => !connected.has(String(node.id)));

  const lines: string[] = [
    '# Ruang Informasi 3D — Ringkasan Progress',
    `_Diekspor ${when(Date.now())} · ${nodes.length} objek · ${internalEdges.length} garis_`,
    '',
    '## Ikhtisar',
    `- Objek: ${nodes.length}`,
    `- Garis: ${internalEdges.length}`,
    `- Objek tanpa koneksi: ${orphans.length}`,
    `- Label: ${labels.length ? labels.join(', ') : '—'}`,
    '',
  ];

  if (kindCounts.size > 0) {
    lines.push('### Objek per jenis pengetahuan', '');
    for (const [kind, count] of [...kindCounts].sort((a, b) => b[1] - a[1])) lines.push(`- ${kind}: ${count}`);
    lines.push('');
  }

  if (relationCounts.size > 0) {
    lines.push('### Garis per relasi', '');
    for (const [relation, count] of [...relationCounts].sort((a, b) => b[1] - a[1])) lines.push(`- ${relation}: ${count}`);
    lines.push('');
  }

  if (orphans.length > 0) {
    lines.push('### Objek tanpa koneksi', '');
    for (const node of orphans) lines.push(`- ${String(node.title || 'Tanpa Judul')}`);
    lines.push('');
  }

  lines.push('## Daftar Objek', '');
  if (nodes.length === 0) {
    lines.push('_Belum ada objek pada cakupan ini._', '');
  } else {
    for (const node of nodes) lines.push(...nodeLines(node, internalEdges, titleById));
    lines.push('');
  }

  return lines.join('\n');
}
