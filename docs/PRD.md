# PRD — Ruang Informasi 3D

## 1. What this is

A personal knowledge workspace where information lives in three dimensions. You
create **objects** (notes, claims, questions, evidence, models, …), connect them
with **relations**, and annotate how you know what you know. The space is the
filing cabinet: position, colour, size and clusters are meaningful, and the app
never pretends to judge truth — it records *your* review of a claim.

The original product arrived as one 33,000-line HTML file written by hand in many
passes ("Fase"/"Tahap" generations). It works, but it cannot be maintained or
extended comfortably. This PRD describes the same product as a real application:
React + Vite frontend, Go + Gin + GORM + SQLite backend, one repository.

## 2. Principles

1. **Spatial memory.** The 3D arrangement is data, not decoration. Objects keep
   their coordinates; layout tools (physics, auto-arrange, placement rules)
   assist without overwriting intent.
2. **Epistemic honesty.** Statuses like `Didukung bukti` ("supported by
   evidence") are labels the *user* chooses. The app never computes truth, never
   auto-classifies, and keeps old reasoning visible instead of silently
   rewriting it.
3. **Guidance is optional.** Hints, tours and guided sessions exist, but every
   surface works without them.
4. **Data is owned locally.** One SQLite file on your machine, one user, no
   accounts. Exports are plain JSON and re-import cleanly.
5. **Indonesian interface.** All user-facing copy stays in Indonesian; the
   rewrite matches the legacy wording so existing users recognise everything.

## 3. Users and journeys

Primary user: a student/researcher/knowledge worker building a study or research
space (the original author's friend), now maintained by a small team.

**Capture → connect → annotate → review → present**

1. *Capture*: create an object (`N`), give it a title, write notes across pages,
   attach files, tag it, pick a shape/colour, optionally write a formula.
2. *Connect*: switch to the connect tool, click source then target. Each relation
   can carry a symbolic meaning (`→`, `⊆`, `≈`, …) **and** an epistemic meaning
   (e.g. `Mendukung`, `Menyanggah`, `Diuji melalui`).
3. *Annotate*: set kind/status/scope/assumptions/limitations/provenance on the
   object; keep the claim honest about what it does not cover.
4. *Review*: open the read view, page through notes, inspect attachments and math,
   later record a decision (retained/doubted/revised/rejected) in the knowledge
   workbench and audit traceability.
5. *Present*: export JSON, share a snapshot, later generate a Word/PDF report
   with cover and table of contents, or export analytics (heatmap/matrix).

## 4. Domain model

| Concept | Meaning |
| --- | --- |
| **Object (node)** | One information card: title, multi-page rich notes, labels, attachments, math expression, epistemic metadata, visual appearance, position. |
| **Relation (edge)** | Connects two objects; carries a symbolic relation symbol and an optional epistemic relation annotation (type, status, rationale, qualifier, source references). |
| **Epistemic kind** | 17 values: `note`, `observation`, `concept`, `definition`, `question`, `claim`, `hypothesis`, `source`, `model`, `procedure`, `action`, `result`, `reflection`, `evidence`, `assumption`, `prediction`, `experiment`. |
| **Epistemic status** | 8 values from `unreviewed` to `superseded`. |
| **Epistemic relation type** | 20 types (19 named ones such as `abstracts_to`, `supports`, `challenges`, `tested_by`, plus `custom`) with expected source/target kinds; kind mismatches warn, unknown types are preserved. |
| **Knowledge records** | Decision history, learning episodes, action cycles — append-only notes about how understanding changed. |
| **Trash** | Archived objects/relations with restore, plus permanent delete. |
| **Snapshot** | Whole-workspace recovery point stored on the server. |
| **Container** | A box that groups objects; physics-aware (later stage). |
| **Cluster** | Automatically detected groups by label/similarity/spatial density (later stage). |
| **Tour / flow** | Scripted camera presentation; guided session journeys (later stages). |
| **Theme / space settings** | Visual concept, materials, trails; grid, fog, lights, camera limits. |

The wire format (`docs/ARCHITECTURE.md`) is the legacy JSON envelope, so exports
from the old app import unchanged.

## 5. Requirements

Each item lists acceptance criteria (AC). Status is tracked feature-by-feature in
`docs/PORT-CHECKLIST.md`.

### 5.1 Core space and objects (stage 1 — implemented)

- Create, edit, delete objects and relations; drag objects with a gizmo; snap to
  a 1-unit grid.
- AC: after reload, everything is exactly where it was; deleting asks
  archive/permanent; archived objects can be restored unless an ID collision or a
  missing endpoint blocks it (then the user is told why).
- AC: the object list offers sort (name/newest/last accessed), label filter and
  text search over titles, notes, pages and labels.

### 5.2 Object editor

- Sections: identity + labels, epistemic metadata, multi-page rich notes with
  per-page reading style, attachments, math expression, visual settings
  (8 shapes incl. glowing text, custom image, function graph), relation symbol and
  epistemic relation for edges.
- AC: unsaved changes are guarded; notes are sanitised HTML; formulas validate
  before save; invalid epistemic relations block saving with explicit messages.

### 5.3 Read view

- Page through notes, see epistemic panels, math result, variable chips,
  attachments, relation meaning and direction, dates; keyboard and swipe paging.
- AC: opening an object from any surface (canvas, list, search) lands on the same
  view; opening updates `lastAccessed`.

### 5.4 Data I/O

- Export full or selection as JSON, Markdown summary, copy and share; import with
  a read-only preflight preview, merge/replace modes and placement rules;
  snapshots list/create/restore/delete.
- AC: imports validate before mutating, remap identifiers in merge mode, never
  commit a partial graph, and take a `pre-import` snapshot before replacing.
- AC: a selection export refuses to replace a workspace containing knowledge
  records (they would be lost silently otherwise).

### 5.5 Formula engine

- `x = 3` definitions, dependencies between objects, propagation, unresolved
  dependency reporting, per-edge variable flow, live recalculation.
- AC: cycles terminate; unresolved names are listed instead of failing silently;
  computed values appear in the read view and the HUD.

### 5.6 Epistemic layer (stage 3 for the workbench UI)

- Relation schema V2 validation and building (implemented now); decision history,
  learning episodes, action cycles, traceability audit with severity filters and
  JSON/Markdown export (planned).
- AC: validation messages name the exact field path; unknown future types and
  statuses are preserved with a warning, never dropped.
- AC (planned): audit distinguishes structural errors from incomplete traces and
  never labels a claim true or false.

### 5.7 Physics, clusters, containers (stage 2 — planned)

- Force-directed layout with manual/automatic modes, cluster detection
  (label/spatial/hybrid) with Louvain grouping, container objects that hold and
  arrange members, reconciliation dialog for imported containers.
- AC: physics never moves objects unless enabled; positions remain the user's
  until they apply a layout; cluster colours are reversible.

### 5.8 Visuals (stage 4 — planned)

- 13 visual concepts, materials (glass/paper/solid), density and contrast modes,
  deep customisation (typography, radius, shadows, dock position, 3D grid, camera
  feel), object trails, theme export/import.
- AC: theme changes never touch workspace data; reduced-motion is honoured.

### 5.9 Guidance (stage 5 — planned)

- 9 guided session routes with spotlight highlighting and story scenes; scripted
  tours (auto or manual step lists) that fly the camera.
- AC: both are dismissible at any time and never modify content while playing.

### 5.10 Reporting and history (stage 5 — planned)

- Report generator with cover page, table of contents, per-object pages, KaTeX
  and attachments → Word download or print/PDF; `[[wiki-links]]` and backlinks;
  per-object revisions with diff and restore.
- AC: reports are read-only (no writes); revision restore is itself undoable.

### 5.11 Analytics (stage 6 — planned)

- Voxel heatmap layer, volumetric dashboard, static relation-matrix and density
  heatmap export (SVG/PNG), high-res scene snapshot, graph diff against a baseline
  or an uploaded export.
- AC: analytics layers are additive, never persisted as objects, and never alter
  the graph.

### 5.12 Platform guarantees

- Local, single user, no authentication; the server binds loopback by default.
- Autosave is debounced (~900 ms) and reports state (`Menyimpan…` / `Tersimpan` /
  failure) in the UI; failures are surfaced, never silent.
- Accessibility: modals trap focus and restore it, Escape closes, live regions
  announce toasts and search counts, `prefers-reduced-motion` is respected.
- Performance target: comfortable interaction with ~500 objects / ~750 relations
  on a laptop GPU.

## 6. Non-goals

- Multi-user collaboration, accounts, permissions, realtime co-editing.
- Cloud hosting as a product (the server is local; sharing is export/import).
- Native mobile apps (the interface is responsive; touch gestures are supported).
- Automatic truth evaluation, AI classification of claims, or auto-editing user
  reasoning.
- Server-side search/analytics (stage 1 searches in the browser; revisit only if
  workspaces outgrow that).

## 7. Roadmap

| Stage | Content | State |
| --- | --- | --- |
| 1 | Platform (Go API, store, autosave/snapshots) + core space, editor, read view, list/search, HUD, trash, data I/O, space settings, formula engine, epistemic validation | implemented, in verification |
| 2 | Physics engine, cluster detection, container objects, reconciliation | planned |
| 3 | Knowledge workbench (history/episodes/cycles), traceability audit | planned |
| 4 | Themes, deep customisation, trails | planned |
| 5 | Guided flows, tour designer, reports (Word/PDF), wiki-links/backlinks, revisions | planned |
| 6 | Voxel heatmap, analytics export, scene snapshot, graph diff | planned |

Every stage ships with its surfaces reachable from the existing UI (toolbar,
menu, shortcuts) and must not regress earlier stages. The ledger with exact
per-feature status lives in `docs/PORT-CHECKLIST.md`.
