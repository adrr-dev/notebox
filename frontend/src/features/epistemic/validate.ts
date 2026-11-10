/**
 * Epistemic relation schema V2 — validator and builder.
 *
 * Pure port of the legacy `validateEpistemicRelationV2` / `buildEpistemicRelationV2`
 * (legacy L5563-5733). These functions never mutate their inputs, never invent
 * defaults for missing data and never rewrite IDs: an edge without
 * `epistemicRelation` (any V1 edge) stays valid without inference.
 *
 * Messages are the legacy Indonesian wording, verbatim, because they surface in
 * the editor. Persisted metadata arrives as untyped JSON, so each field is read
 * defensively from a key map instead of being trusted from the declared type.
 */
import { EPISTEMIC_SCHEMA_V2 } from './schemaV2.catalog';
import type { EdgeRecord, EpistemicRelation, EpistemicSourceRef, NodeRecord } from '../../types/model';

export interface Issue {
  code: string;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface EpistemicGraph {
  nodes?: NodeRecord[];
  edges?: EdgeRecord[];
}

export interface EpistemicDraft {
  type?: string;
  status?: string;
  rationale?: string;
  qualifier?: string;
  customLabel?: string;
  sourceRefs?: EpistemicSourceRef[];
}

export interface BuildEpistemicRelationResult {
  relation: EpistemicRelation | null;
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
}

interface RelationDescriptor {
  label: string;
  description: string;
  sourceKinds: readonly string[] | null;
  targetKinds: readonly string[] | null;
  diagramPath: string;
}

const relationTypes = EPISTEMIC_SCHEMA_V2.relationTypes as unknown as Record<string, RelationDescriptor>;
const nodeKinds = EPISTEMIC_SCHEMA_V2.nodeKinds as unknown as Record<string, string>;
const relationStatuses = EPISTEMIC_SCHEMA_V2.relationStatuses as readonly string[];

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Persisted V2 metadata is untyped JSON: read a confirmed plain object as a key
 * map, or get null when the value is not a plain object.
 */
function keyMapOf(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Validates the `epistemicRelation` metadata of one edge against the V2
 * catalogue. Returns every issue found — warnings never block the caller.
 */
export function validateEpistemicRelation(edge: EdgeRecord, graph: EpistemicGraph = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, severity: Issue['severity'], path: string, message: string) => {
    issues.push({ code, severity, path, message });
  };

  const rawRelation: unknown = (edge as unknown as { epistemicRelation?: unknown } | null)?.epistemicRelation;
  if (rawRelation === undefined || rawRelation === null) return issues; // V1 edge without metadata stays valid.
  const relation = keyMapOf(rawRelation);
  if (!relation) {
    add('relation_not_object', 'error', 'epistemicRelation', 'epistemicRelation harus berupa objek.');
    return issues;
  }

  const rawType = relation.type;
  if (typeof rawType !== 'string' || !rawType.trim()) {
    add(
      'relation_type_required',
      'error',
      'epistemicRelation.type',
      'Jenis relasi epistemik wajib berupa string yang tidak kosong.',
    );
    return issues;
  }
  const type = rawType;

  const descriptor = hasOwn(relationTypes, type) ? relationTypes[type] : null;
  if (!descriptor) {
    // Future types are preserved; the warning only tells the user the local catalogue is behind.
    add(
      'unknown_relation_type',
      'warning',
      'epistemicRelation.type',
      `Jenis relasi '${type}' tidak dikenal oleh katalog V2; jangan menghapus atau mengubahnya otomatis.`,
    );
  }
  const customLabel = relation.customLabel;
  if (type === 'custom' && (typeof customLabel !== 'string' || !customLabel.trim())) {
    add(
      'custom_label_required',
      'error',
      'epistemicRelation.customLabel',
      'Relasi custom memerlukan customLabel yang tidak kosong.',
    );
  }
  for (const field of ['rationale', 'qualifier', 'customLabel'] as const) {
    if (hasOwn(relation, field) && typeof relation[field] !== 'string') {
      add('field_must_be_string', 'error', `epistemicRelation.${field}`, `${field} harus berupa string jika disediakan.`);
    }
  }
  if (hasOwn(relation, 'status')) {
    const status = relation.status;
    if (typeof status !== 'string') {
      add('status_must_be_string', 'error', 'epistemicRelation.status', 'Status relasi harus berupa string.');
    } else if (!relationStatuses.includes(status)) {
      add(
        'unknown_relation_status',
        'warning',
        'epistemicRelation.status',
        `Status '${status}' tidak dikenal oleh katalog V2; nilai dipertahankan.`,
      );
    }
  }
  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!hasOwn(relation, field)) continue;
    const timestamp = relation[field];
    if (timestamp === undefined || timestamp === null) continue;
    if (typeof timestamp !== 'string' || !timestamp.trim() || !Number.isFinite(Date.parse(timestamp))) {
      add(
        'invalid_timestamp',
        'error',
        `epistemicRelation.${field}`,
        `${field} harus berupa tanggal-waktu yang dapat diparse jika disediakan.`,
      );
    }
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : null;
  const edges = Array.isArray(graph.edges) ? graph.edges : null;
  const byId = <T extends { id: unknown }>(list: ReadonlyArray<T>, id: unknown): T | null =>
    list.find((item) => item != null && String(item.id) === String(id)) ?? null;
  const sourceId: unknown = edge.sourceId;
  const targetId: unknown = edge.targetId;
  const source = nodes ? byId(nodes, sourceId) : null;
  const target = nodes ? byId(nodes, targetId) : null;
  if (nodes) {
    if (sourceId === undefined || sourceId === null || !source) {
      add('missing_source_node', 'error', 'sourceId', 'Node sumber edge tidak ditemukan dalam graf yang diberikan.');
    }
    if (targetId === undefined || targetId === null || !target) {
      add('missing_target_node', 'error', 'targetId', 'Node tujuan edge tidak ditemukan dalam graf yang diberikan.');
    }
  }
  if (descriptor && type !== 'custom' && source && target) {
    const sourceKind: unknown = source.kind;
    const targetKind: unknown = target.kind;
    if (
      Array.isArray(descriptor.sourceKinds) &&
      typeof sourceKind === 'string' &&
      hasOwn(nodeKinds, sourceKind) &&
      !descriptor.sourceKinds.includes(sourceKind)
    ) {
      add(
        'source_kind_mismatch',
        'warning',
        'sourceId',
        `Jenis node sumber '${sourceKind}' tidak lazim untuk relasi '${type}'. Periksa arah dan maksud relasi.`,
      );
    }
    if (
      Array.isArray(descriptor.targetKinds) &&
      typeof targetKind === 'string' &&
      hasOwn(nodeKinds, targetKind) &&
      !descriptor.targetKinds.includes(targetKind)
    ) {
      add(
        'target_kind_mismatch',
        'warning',
        'targetId',
        `Jenis node tujuan '${targetKind}' tidak lazim untuk relasi '${type}'. Periksa arah dan maksud relasi.`,
      );
    }
  }

  if (hasOwn(relation, 'sourceRefs')) {
    const rawRefs = relation.sourceRefs;
    if (!Array.isArray(rawRefs)) {
      add('source_refs_not_array', 'error', 'epistemicRelation.sourceRefs', 'sourceRefs harus berupa array referensi.');
    } else {
      rawRefs.forEach((rawRef: unknown, index) => {
        const path = `epistemicRelation.sourceRefs[${index}]`;
        const ref = keyMapOf(rawRef);
        const refType = ref?.type;
        const refId = ref?.id;
        if (
          !ref ||
          (refType !== 'node' && refType !== 'edge') ||
          refId === undefined ||
          refId === null ||
          String(refId).trim() === ''
        ) {
          add('invalid_source_ref', 'error', path, 'Referensi harus memiliki type node/edge dan ID yang tidak kosong.');
          return;
        }
        if (hasOwn(ref, 'unresolved') && typeof ref.unresolved !== 'boolean') {
          add('invalid_unresolved_flag', 'error', `${path}.unresolved`, 'unresolved harus berupa boolean jika disediakan.');
        }
        if (hasOwn(ref, 'titleSnapshot') && typeof ref.titleSnapshot !== 'string') {
          add(
            'invalid_title_snapshot',
            'error',
            `${path}.titleSnapshot`,
            'titleSnapshot harus berupa string jika disediakan.',
          );
        }
        const pool = refType === 'node' ? nodes : edges;
        // Out-of-subgraph references survive only with an explicit unresolved snapshot.
        if (pool && !byId<NodeRecord | EdgeRecord>(pool, refId)) {
          const unresolved = ref.unresolved;
          const titleSnapshot = ref.titleSnapshot;
          if (unresolved === true && typeof titleSnapshot === 'string' && titleSnapshot.trim()) {
            add(
              'unresolved_source_ref_snapshot',
              'warning',
              `${path}.id`,
              `Referensi ${refType} '${refId}' tidak berada pada subgraf ini; snapshot dipertahankan.`,
            );
          } else {
            add(
              'unresolved_source_ref',
              'error',
              `${path}.id`,
              `Referensi ${refType} '${refId}' tidak ditemukan dalam graf yang diberikan dan tidak mempunyai snapshot ketakter-selesaian yang eksplisit.`,
            );
          }
        }
      });
    }
  }
  return issues;
}

/**
 * Builds the relation metadata for an edge from an editor draft without
 * mutating the edge. An empty `draft.type` releases the metadata explicitly
 * (`relation: null`). Existing metadata is merged, `createdAt` is kept and
 * `updatedAt` is stamped with `now`.
 */
export function buildEpistemicRelation(
  edge: EdgeRecord,
  draft: EpistemicDraft = {},
  graph: EpistemicGraph = {},
  now: string = new Date().toISOString(),
): BuildEpistemicRelationResult {
  if (!edge || typeof edge !== 'object') throw new Error('Edge yang akan diberi metadata tidak tersedia.');
  const type = typeof draft.type === 'string' ? draft.type.trim() : '';
  if (!type) return { relation: null, issues: [], errors: [], warnings: [] };

  const rawPrevious: unknown = edge.epistemicRelation;
  const previous = keyMapOf(rawPrevious) ?? {};
  const status = typeof draft.status === 'string' && draft.status ? draft.status : 'unreviewed';
  const createdAt = typeof previous.createdAt === 'string' && previous.createdAt ? previous.createdAt : now;
  // Unknown keys already present are carried over verbatim (forward compatibility).
  const relation: EpistemicRelation & Record<string, unknown> = {
    ...previous,
    type,
    status,
    createdAt,
    updatedAt: now,
  };

  const rationale = typeof draft.rationale === 'string' ? draft.rationale.trim() : '';
  const qualifier = typeof draft.qualifier === 'string' ? draft.qualifier.trim() : '';
  if (rationale) relation.rationale = rationale;
  else delete relation.rationale;
  if (qualifier) relation.qualifier = qualifier;
  else delete relation.qualifier;
  if (Array.isArray(draft.sourceRefs) && draft.sourceRefs.length) {
    relation.sourceRefs = JSON.parse(JSON.stringify(draft.sourceRefs));
  } else delete relation.sourceRefs;
  const customLabel = typeof draft.customLabel === 'string' ? draft.customLabel.trim() : '';
  if (type === 'custom') relation.customLabel = customLabel;
  else delete relation.customLabel;

  const issues = validateEpistemicRelation({ ...edge, epistemicRelation: relation }, graph);
  return {
    relation,
    issues,
    errors: issues.filter((issue) => issue.severity === 'error'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}
