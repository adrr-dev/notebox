# Ruang Informasi 3D

A 3D knowledge workspace: objects and relations live in a three-dimensional
space, each with rich notes, math, attachments, and an "epistemic" annotation
layer that records how a claim was reviewed. The app was originally a single
33,000-line HTML file; this repository is the rewrite into a maintainable
project.

| Piece | Stack |
| --- | --- |
| Frontend | React 19 · Vite 8 · TypeScript (strict) · Tailwind v4 · zustand · three.js |
| Backend | Go · Gin · GORM · SQLite (CGO-free driver) |
| Persistence | One SQLite file, owned by the Go server; browser keeps no authoritative copy |
| Production | `make build` → one Go binary with the frontend embedded |

The original artifact is preserved untouched at
`legacy/RI3D_Cabang22_Tahap5_PerspectiveOwnership.html` and is the reference for
feature parity.

## Quick start

```bash
make dev          # backend http://127.0.0.1:8787 + Vite http://localhost:5173
```

First run creates the SQLite database (`~/.config/ri3d/ri3d.db` by default) and
seeds one workspace with a getting-started object.

Useful targets (the Vite dev server listens on `localhost` — IPv6 loopback):

```bash
make dev-backend   # Go API only
make dev-frontend  # Vite only (proxies /api to the backend)
make test          # Go test suite
make typecheck     # frontend type-check
make build         # single binary with the frontend embedded → backend/bin/ri3d-server
```

Override defaults with flags or environment variables:

```bash
go run ./cmd/ri3d-server --addr 127.0.0.1:8787 --db ./data/ri3d.db --gin-mode debug
# RI3D_ADDR, RI3D_DB, RI3D_STATIC, RI3D_GIN_MODE
```

## Repository layout

```
backend/                     Go API server
  cmd/ri3d-server/           entry point
  internal/config/           flags + environment
  internal/database/         SQLite open/migrate/pragmas
  internal/models/           persisted entities (workspace envelope schema)
  internal/schema/           export envelope + validation rules
  internal/service/          import planner, envelope assembly
  internal/store/            database access layer
  internal/handlers/         REST handlers
  internal/router/           routes + SPA fallback
  internal/web/              embedded frontend (prod build tag)
frontend/                    React application
  src/types/model.ts         wire data model (single source of truth)
  src/api/client.ts          typed backend client
  src/store/                 app store (graph + autosave), UI flags, space settings
  src/three/                 imperative three.js engine + mesh factories
  src/features/              editor, view, list, search, data I/O, formula, epistemic
  src/ui/                    modal shell, confirm dialogs, toasts, toolbar, shortcuts
docs/                        PRD, architecture, port checklist
legacy/                      original single-file app (reference only)
```

## Documentation

- `docs/PRD.md` — what the product is, feature set, acceptance criteria, roadmap.
- `docs/ARCHITECTURE.md` — how the system fits together, contracts, how to extend it.
- `docs/PORT-CHECKLIST.md` — feature-by-feature ledger against the legacy app.

## Data compatibility

The exported/imported JSON keeps the original envelope
(`{app, version, formatVersion, knowledgeModelVersion, scope, nodes, edges, trash,
epistemicHistory, learningEpisodes, actionCycles, camera, tour, fase2}`), so files
written by the legacy app import here without conversion. Imports support merge
(fresh identifiers) and replace (with placement rules), never committing a partial
graph, and they take a recovery snapshot before overwriting anything.
