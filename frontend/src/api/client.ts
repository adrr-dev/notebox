/**
 * Backend API client.
 *
 * All persistence goes through the Go server: the browser keeps no authoritative
 * copy of the workspace. Errors are surfaced as `ApiError` with the server's
 * issue list attached so forms can render field-level messages.
 */
import type {
  ApiIssue,
  GraphPayload,
  ImportOutcome,
  SnapshotSummary,
  WorkspaceEnvelope,
  WorkspaceFull,
  WorkspaceSummary,
} from '../types/model';

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[];

  constructor(status: number, code: string, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ApiError(0, 'network_error', 'Tidak dapat menghubungi server lokal. Pastikan backend berjalan.', []);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; issues?: ApiIssue[] } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? `Permintaan gagal (HTTP ${response.status}).`,
      error?.issues ?? [],
    );
  }
  return body as T;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

/** Health probe; used by the boot screen to explain a missing backend. */
export async function health(): Promise<{ status: string; app: string; formatVersion: number }> {
  return request('/health');
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const body = await request<{ workspaces: WorkspaceSummary[] }>('/workspaces');
  return body.workspaces ?? [];
}

export async function createWorkspace(name: string): Promise<WorkspaceSummary> {
  const body = await request<{ workspace: WorkspaceSummary }>('/workspaces', json({ name }));
  return body.workspace;
}

export async function getWorkspace(id: number): Promise<WorkspaceFull> {
  return request(`/workspaces/${id}`);
}

/** Persist the complete graph (the app's autosave write). */
export async function putGraph(id: number, payload: GraphPayload): Promise<{ nodes: number; edges: number; updatedAt: string }> {
  return request(`/workspaces/${id}/graph`, { ...json(payload), method: 'PUT' });
}

/** Download the export envelope (also used for snapshots and reports). */
export async function fetchExport(id: number): Promise<WorkspaceEnvelope> {
  return request(`/workspaces/${id}/export`);
}

export interface ImportParams {
  mode: 'merge' | 'replace';
  rule: 'original' | 'offset' | 'origin' | 'camera' | 'grid';
  dx?: number;
  dy?: number;
  dz?: number;
  avoid?: boolean;
}

/** Import an envelope from another export. */
export async function importEnvelope(id: number, envelope: WorkspaceEnvelope, params: ImportParams): Promise<ImportOutcome> {
  const query = new URLSearchParams({ mode: params.mode, rule: params.rule });
  if (params.dx) query.set('dx', String(params.dx));
  if (params.dy) query.set('dy', String(params.dy));
  if (params.dz) query.set('dz', String(params.dz));
  if (params.avoid) query.set('avoid', 'true');
  return request(`/workspaces/${id}/import?${query}`, json(envelope));
}

export async function listSnapshots(id: number): Promise<SnapshotSummary[]> {
  const body = await request<{ snapshots: SnapshotSummary[] }>(`/workspaces/${id}/snapshots`);
  return body.snapshots ?? [];
}

export async function createSnapshot(id: number, reason: string, autosaveVersion = 1): Promise<SnapshotSummary> {
  const body = await request<{ snapshot: SnapshotSummary }>(
    `/workspaces/${id}/snapshots`,
    json({ reason, autosaveVersion }),
  );
  return body.snapshot;
}

export async function getSnapshotPayload(id: number, snapshotId: number): Promise<WorkspaceEnvelope> {
  const body = await request<{ snapshot: { payload: WorkspaceEnvelope } }>(`/workspaces/${id}/snapshots/${snapshotId}`);
  return body.snapshot.payload;
}

export async function deleteSnapshot(id: number, snapshotId: number): Promise<void> {
  await request(`/workspaces/${id}/snapshots/${snapshotId}`, { method: 'DELETE' });
}
