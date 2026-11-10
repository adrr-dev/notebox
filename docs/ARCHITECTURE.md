# Architecture

## Shape of the system

```
┌──────────────────────────── browser ────────────────────────────┐
│ React tree (src/features, src/ui)                               │
│   ├── reads state via zustand selectors                          │
│   ├── mutates via store actions (addNode, updateEdge, …)         │
│   └── calls high-level 3D operations via `engine` (src/three)    │
│                                                                  │
│ src/store/appStore  ── one-way data flow ──▶ src/three/engine    │
│   workspace document                        meshes sync by        │
│   + autosave bookkeeping                    object identity       │
│                                                                  │
│ src/api/client ──HTTP──▶ Go server                               │
└──────────────────────────────────────────────────────────────────┘
```

One store owns the workspace document; the 3D scene is a *projection* of it.
The engine subscribes to the store and diffs by object identity, so a mutation
that produces a new node object triggers a mesh update, while untouched nodes
are not revisited. Interaction flows the other way through store actions — the
engine never mutates data directly except while dragging a gizmo, and even then
it reports positions back through `patchNodePosition`.

## Backend

- `internal/models` mirrors the wire schema. Nodes and edges are rows; everything
  that is edited as a whole document (trash, epistemic records, camera, tour,
  physics state) stays a JSON column on the workspace row so it round-trips
  byte-for-byte. Nested node data (pages, attachments, labels, styles, container
  payloads) is JSON for the same reason.
- `internal/schema` holds the envelope type, the payload size guard (64 MiB) and
  the graph validation rules: unique, non-empty identifiers and no dangling edge
  endpoints.
- `internal/service` turns a workspace + envelope into the state an import would
  write (`PlanImport`): mode guards (merge refuses payloads with knowledge
  records; a selection export cannot replace a workspace that has any),
  knowledge-model stamping, fresh identifiers for merge, reference remapping
  (including epistemic `sourceRefs`), unresolved-reference snapshots, and
  placement rules (`original | offset | origin | camera | grid`, plus overlap
  avoidance).
- `internal/store` is the only place that talks to GORM. `SaveGraph` rewrites
  nodes+edges and the workspace JSON columns in one transaction, so a rejected
  payload can never leave a partial graph.
- Snapshots (`pre-import`, manual, autosave) are recovery points; the store keeps
  the newest 30 per workspace.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness + schema versions |
| GET | `/api/workspaces` | list with node/edge counts |
| POST | `/api/workspaces` | create empty workspace |
| GET | `/api/workspaces/:id` | full workspace (nodes, edges, collections) |
| PUT | `/api/workspaces/:id/graph` | replace the graph (autosave write) |
| GET | `/api/workspaces/:id/export` | download the envelope |
| POST | `/api/workspaces/:id/import` | merge/replace from an envelope (`?mode=&rule=&dx=&dy=&dz=&avoid=`) |
| GET | `/api/workspaces/:id/snapshots` | list recovery points |
| POST | `/api/workspaces/:id/snapshots` | create one (payload optional) |
| GET | `/api/workspaces/:id/snapshots/:snapshotId` | fetch one with payload |
| DELETE | `/api/workspaces/:id/snapshots/:snapshotId` | delete one |

Errors answer `{"error":{"code","message","issues?":[{code,severity,path,message}]}}`.
`ApiError` in the client carries the issues so forms can render field messages.

## Frontend

- `src/types/model.ts` — the wire model. Field names are the contract; do not
  rename them, they are the legacy JSON schema.
- `src/store/normalize.ts` — materializes the defaults the UI and engine rely on
  (the backend omits zero values). Add new defaults here, nowhere else.
- `src/store/appStore.ts` — workspace document, UI state that must survive
  navigation (mode, active editor/viewer, focus), toasts, and persistence
  bookkeeping (900 ms debounced `PUT /graph`, dirty flag, save status).
- `src/store/uiStore.ts` — modal visibility and tool toggles.
- `src/store/spaceStore.ts` — 3D room appearance (grid, fog, lights, camera
  limits); the engine subscribes and applies changes live. Not part of the
  workspace document.
- `src/three/engine.ts` — scene, camera, controls, transform gizmo, picking,
  selection frame, focus/dim, fly-to, keyboard navigation, float motion, and the
  store→scene sync. `src/three/nodeMesh.ts` / `edgeMesh.ts` build geometry;
  `labelSprite.ts` draws text labels; `relationStyle.ts` maps relation symbols to
  colors.
- `src/features/**` — one folder per surface area; components read the store and
  call its actions. Nothing outside `src/three` touches three.js except the mesh
  factories and the minimap.
- `src/ui/**` — shared primitives: `Modal` (Escape, focus trap, focus restore),
  `confirmDialog`, `chooseDeleteMode`, `Toasts`, KaTeX helpers, toolbar,
  shortcuts.

## Conventions

- UI copy is Indonesian, matching the legacy wording where it exists. Code,
  comments and docs are English.
- Mutations go through store actions; never write to `useAppStore.setState`
  directly from a feature.
- New persisted fields: add to `backend/internal/models`, normalize defaults in
  `frontend/src/store/normalize.ts`, and extend `types/model.ts`. Keep the JSON
  key identical in all three places.
- Validation lives on the backend for anything that can corrupt a workspace;
  UI-side validation is for immediate feedback only.

## Verification

- `make test` — Go unit tests for validation, import planning (remap, placement,
  guards, unresolved references) and envelope assembly.
- `make typecheck` — strict TypeScript across the frontend.
- Manual smoke path for a stage: boot (`make dev`), create/edit/delete objects,
  connect them, reload the page (state must come back), export JSON, re-import it
  (merge and replace), restore a snapshot.
