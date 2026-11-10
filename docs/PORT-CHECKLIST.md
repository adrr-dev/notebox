# Port checklist — Ruang Informasi 3D

`legacy/RI3D_Cabang22_Tahap5_PerspectiveOwnership.html` is the original artifact: a single-file HTML app (~33k lines, Indonesian UI, CDN three.js/mathjs/KaTeX/d3/Firebase, no build step) that this repository replaces with a Go + Gin + GORM + SQLite backend (`backend/`), a React 19 + Vite + TypeScript + Tailwind + zustand frontend (`frontend/`) and an imperative three.js engine (`frontend/src/three/`).

This file is the authoritative feature ledger for the rewrite: what the app does, where each feature lived in the legacy file, and whether it exists in the new stack. The port is staged — stage 1 covers the core graph/editor/read surfaces, data I/O, the formula engine and the epistemic schema; later stages cover physics/clusters/containers, the voxel heatmap, the knowledge-workbench UI, themes + trails, guided sessions, the tour designer, the Word/PDF report generator, richer minimap features, wiki-links/backlinks/revisions and the remaining polish layers.

Each bullet names a concrete feature, its legacy line reference and its status. A feature is only `ported` when the code exists in `frontend/src/**` or `backend/**`; `partial` names what is missing; `planned` means no module exists yet.

## Status legend

- `ported` — implemented in the new stack and present in the tree.
- `partial` — a subset is implemented; the missing part is named.
- `planned` — not started.
- Markers: `- [x]` ported · `- [~]` partial · `- [ ]` planned.

**Status as of 2026-11-10** — stage 1 in progress; parts still being written during this pass are marked `partial` even when their supporting modules exist.

## Summary

| # | Area | Legacy location | Status | Notes |
|---|------|-----------------|--------|-------|
| 1 | Platform rewrite: backend API, store, autosave | new (replaces Firestore + IndexedDB) | ported | Go REST API, transactional whole-document writes, server validation, snapshots; zustand store with 900 ms debounced PUT |
| 2 | Core script: scene, shapes, interaction, list/HUD, formula engine | `L5445-13141` (Core1) | partial | graph core, math engine, list/search/HUD ported; container behaviour and old chrome missing |
| 3 | Read & edit surfaces: view modal, editor, window manager | `L8238-11729` (Core2) | partial | view modal, editor modal, rich text, panels ported; window manager not started |
| 4 | Data I/O + guided tour | `L13142-15168` (Core3) | partial | export/import/share/markdown/snapshots ported on the Go backend; tour designer not started |
| 5 | Export/docs: FX, wiki-links, revisions, reports, UX layers | `L15169-17540` (ExportDocs) | partial | fly-to, focus/dim, rich-text tooling ported; wiki-links, revisions, Word/PDF report missing |
| 6 | Fase 1: touch, hints, label collision, minimap | `L17540-19316` (Phase1) | partial | minimap and label priorities ported; gestures, hints, collision solver missing |
| 7 | Fase 2: physics, clusters, containers | `L19457-22952` (Phase2) | planned | only the container shell mesh exists; no simulation |
| 8 | Fase 3/4: heatmap, analytics, watchers, cloud, diff | `L22954-24555` (FormulaHeat) | partial | formula watcher + variables modal ported; heatmap, d3 export, PNG snapshot, diff, cloud not started |
| 9 | Epistemic schema, validator, workbench, audit | `L24557-25583` (Epistemic) | partial | catalogue + validator + read/edit surfaces + server ref remap ported; workbench and audit missing |
| 10 | Themes, deep customization, trails, command palette | `L25585-28227` (ThemeUI) | planned | new UI uses plain Tailwind styles instead of the CSS-variable theme engine |
| 11 | Persistence, profile, description tools, flow sessions | `L28229-31021` (PersistFlow) | partial | server autosave/snapshots, profile icons and description tools ported; guided flows missing |
| 12 | Tail patches: master centre, parity, CSS stages | `L31023-32960` (TailPatches) | planned | deliberately dropped; superseded by React components |
| 13 | Markup & CSS shell, modals, i18n | `L3267-5445` (MarkupPRD) | partial | toolbar, HUD, modals re-implemented in React; i18n stays hardcoded Indonesian |

## 1. Platform rewrite — backend API, store, autosave (new; no legacy equivalent)

- [x] REST API: health, workspace list/create/get, whole-graph `PUT`, export, import, snapshot CRUD — `backend/internal/handlers/api.go:35-46`, `backend/internal/router/router.go`.
- [x] Whole-document graph write in one GORM transaction, so a rejected payload cannot leave a partial graph — `backend/internal/store/store.go:102-138`.
- [x] Server-side pre-write validation (duplicate ids, dangling edge endpoints, bad shapes/timestamps) and the `{"error":{code,message,issues}}` contract — `backend/internal/schema/envelope.go` (`ValidateGraph`).
- [x] Snapshots: 30 per workspace retention plus an automatic `pre-import` snapshot — `backend/internal/store/store.go:21-22,140-171`, `backend/internal/handlers/api.go:223-225`.
- [x] Import planner in Go: merge/replace, id remap, placement `original|offset|origin|camera|grid`, avoid-overlap nudge, epistemic `sourceRefs` remap and unresolved marking — `backend/internal/service/import.go:140-380,395-478`, tests in `backend/internal/service/import_test.go`.
- [x] Typed API client and wire model — `frontend/src/api/client.ts`, `frontend/src/types/model.ts`.
- [x] zustand `appStore`: boots the first workspace (creating one when empty), normalizes records, commits mutations and autosaves the whole document with a 900 ms debounce, plus `saveNow` for Ctrl+S — `frontend/src/store/appStore.ts:208-580`.
- [x] Save-state pill `Menyimpan…` / `Tersimpan …` / `Gagal menyimpan: …` and a boot screen with `Coba lagi` when the API is unreachable — `frontend/src/App.tsx`.
- [x] Legacy id scheme kept: numeric node clock advanced past collisions, edges `edge_<clock>` — `frontend/src/store/appStore.ts:180-206`.
- [x] Single-binary build (frontend embedded into Go) and dev targets — `Makefile`, `backend/internal/web/embed_*.go`.

## 2. Core script: scene, shapes, interaction, list/HUD, formula engine (`L5445-13141`)

- [x] Scene: `#0f172a` background, exponential fog, 60° camera at `(0,5,15)`, antialiased renderer, ambient + directional light, `OrbitControls` (damping 0.05, distance limit) — legacy `initThreeJS` `L6686-6760`; `frontend/src/three/engine.ts:116-143`.
- [x] Space settings: camera zoom limit, floor grid size/Y, fog toggle + density, XZ/XY/YZ planes, labelled axes, drop-line toggle, voxel reference-grid density, lights — legacy `L6761-6954`; `frontend/src/features/settings/SpaceSettingsModal.tsx`, `frontend/src/store/spaceStore.ts`, `frontend/src/three/engine.ts:267-343`.
- [x] Node shapes `cube`/`sphere`/`cylinder`/`icosahedron`/`text3d`/`custom_image`/`graph3d` (`curve` and `surface`, mathjs-compiled with an error marker fallback) — legacy `createNodeMesh` `L11904-12081`; `frontend/src/three/nodeMesh.ts:36-377`.
- [x] Drop-lines to the XZ floor and the X/Y/Z zero planes, hidden within 0.1 units — legacy `updateDropLines` `L12091`; `frontend/src/three/nodeMesh.ts:485-519`.
- [x] Label sprites with canvas texture cache and the legacy priority ladder (text3d 90, relation 80, flow 60, axis 45) — `frontend/src/three/labelSprite.ts`.
- [x] Edges: relation-coloured line (dashed for negated/approximate symbols), relation badge sprite, variable-flow chips, 1.6-unit endpoint padding — legacy `getRelationStyle`/`createEdgeMesh` `L12131-12240`; `frontend/src/three/edgeMesh.ts`, `relationStyle.ts`.
- [x] Relation catalogue (56 math/logic symbols with Indonesian labels) — legacy `L4427-4505`; `frontend/src/features/graph/relationSymbols.data.ts`.
- [x] Interaction modes `pointer|move|connect|delete` with raycast picking on pointer-up (6 px move guard; legacy used 5 px), two-click connect with the `Berhasil terhubung!` toast, delete via the archive/permanent dialog — legacy `L12243-12394`; `frontend/src/three/engine.ts:181-196,472-556`, `frontend/src/ui/DeleteChoiceDialog.tsx`.
- [x] Move mode via `TransformControls`: drag writes live `posX/Y/Z` into the store — legacy `L6722-6733`; `frontend/src/three/engine.ts:143-169`.
- [x] Snap-to-grid (1 unit) and auto-arrange (√N grid) — legacy `L11761-11805`; `engine.setSnapEnabled` / `engine.autoArrange` in `frontend/src/three/engine.ts:814-880`.
- [x] `flyTo`/`zoomToFit`/`resetCamera`, focus overlay + neighbour dimming (0.2) and highlight pulse — legacy `L5866-5957`, `L12708`; `frontend/src/three/engine.ts`, `frontend/src/three/selectionFocus.ts`.
- [x] Float motion for non-static nodes (±0.12 on Y) and WASD/QE movement, both honouring reduced motion — legacy `L12935-12988`; `frontend/src/three/engine.ts:654-740`.
- [x] HUD readout (`Koordinat Objek`, `Kamera (X Y Z)`) — legacy `L3465-3483`; `frontend/src/features/hud/Hud.tsx`.
- [x] Object list panel: sort `name|newest|lastAccessed`, label filter, NFKD-normalized search over title/description/pages/labels, rows that focus and open the viewer — legacy `L12731-12839`; `frontend/src/features/list/ObjectListPanel.tsx`.
- [x] Global search overlay: live hits (max 100) over title, plain-text description, pages, labels and attachment names, ↑/↓/Enter navigation, match highlighting — legacy `L23961-24034`; `frontend/src/features/search/SearchOverlay.tsx`.
- [x] Trash: soft delete (a node also archives its edges), restore blocked on id collision or missing endpoint, per-item purge and empty bin, all confirm-gated — legacy `L12396-12705`; `frontend/src/store/appStore.ts`, `frontend/src/features/trash/TrashModal.tsx`.
- [x] Formula/math engine: expression symbol extraction, mathjs evaluation with Indonesian error messages, graph3d compilation, the cycle-safe fixed point (`entities.length + 1` passes) producing `localDefs`/`globalList`/`unresolvedList`/`edgeFlow` and computed `mathValue`s written back to the graph — legacy `L7677-7888`; `frontend/src/features/formula/evaluate.ts`, `recalc.ts`, `formulaStore.ts`, `recomputeBridge.ts`; edge variable chips render from `edgeFlow`.
- [x] Math evaluator modal, LaTeX syntax dictionary with KaTeX previews, KaTeX rendering of expressions — legacy `L5223-5288`, `L5293-5343`; `frontend/src/features/tools/*`, `frontend/src/ui/katex.tsx`.
- [x] Global variables modal (definers, conflicts, unresolved dependencies) — legacy `L5383-5437`; `frontend/src/features/formula/GlobalVarsModal.tsx`.
- [~] Container nodes: shell/handle mesh and the `ctn` payload are ported, but fit mode, member management, layouts and walls are stage 2 — `frontend/src/three/nodeMesh.ts`, `frontend/src/types/model.ts`.
- [~] Voxel space is the plain reference point grid (legacy `confVoxel`), not a heatmap and without label LOD — legacy `L6415-6544`; `frontend/src/three/engine.ts:317-329`.
- [ ] Old dock/menu chrome (`#ux-dock`, `#ux-menu` re-parenting, per-window settings) — legacy `L9233-11487`, `L16596-16950`: planned, replaced by React layout (see deviations).

## 3. Read & edit surfaces: view modal, editor, window manager (`L8238-11729`)

- [x] View modal: identity header (icon/badge/date), label chips, epistemic panel (kind/status/scope/assumptions/limitations/provenance), edge relation panel (type/custom label/status/rationale/qualifier/sourceRefs with unresolved markers), math line, attachment cards with inline images, multi-page description with tabs/counter/progress, arrow-key + swipe paging, `lastAccessed` stamped once — legacy `L8934-9123`, markup `L3516-3674`; `frontend/src/features/view/ViewModal.tsx`, `viewPages.ts`.
- [x] Object editor modal for nodes and edges: local draft committed only on `Simpan Perubahan`, with an unsaved-changes confirm — legacy markup `L3675-4614`, open/save `L8238-8912`, guard `L16466-16527`; `frontend/src/features/editor/EditorModal.tsx`.
- [x] Shape picker with the legacy labels (`Kubus Solid`, `Bola Presisi`, `Silinder Tabung`, `Permata (Icosahedron)`, `Teks Menyala (Neon)`, `Gambar Kustom (Sprite)`, `Grafik Fungsi (Kurva/Permukaan)`, `Container (Kotak Batas 3D)`) — `EditorModal.tsx:36-47`.
- [x] Rich-text description editor: contenteditable with `execCommand` parity (bold/italic/underline/strike, colours, highlight, block format, rule), tabs `Struktur & sisipan`/`Gaya halaman`/`Cari & statistik`/`HTML lanjutan`, table 2×3, LaTeX insert, HTML source apply, statistics, find/replace on the active page, paste sanitization — legacy `L8606-8715`, `L29538-29902`; `frontend/src/features/editor/RichTextEditor.tsx`.
- [x] Rich-HTML sanitizer/normalizer: tag/attribute allow-lists, `<font>`→`<span style>`, style/URL caps (image 8 Mi, media/attachment 24 Mi chars), active `data:` documents (HTML/SVG/JS) blocked — legacy `L5998-6249`; `frontend/src/features/editor/richTextHtml.ts`.
- [x] Per-page reading style (font, size, line-height, alignment, width, spacing, indent, padding, text/bg colours) with presets and normalization — legacy `L4058-4130`, `L29538-29745`; `frontend/src/features/editor/DescStylePanel.tsx`, `frontend/src/store/normalize.ts`.
- [x] Epistemic metadata panel for nodes, preserving stored-but-unknown kinds/statuses — legacy `L3733-3800`, `L8300-8366`; `frontend/src/features/editor/EpistemicMetaPanel.tsx`.
- [x] Edge relation panel (symbol picker + epistemic relation fields) and relation builder that keeps unknown keys verbatim — `frontend/src/features/editor/EdgeRelationPanel.tsx`, `frontend/src/features/epistemic/validate.ts`.
- [x] Labels chip input with Enter/comma commit and workspace datalist — legacy `L6956-6985`; `frontend/src/features/editor/labelsInput.tsx`.
- [x] Profile/identity customizer: 24 fixed Font Awesome icons, custom glyph (≤16 chars), raster image data URL (≤750 000 chars), fg/bg colours, per-type defaults — legacy `L29277-29510`; `frontend/src/features/editor/ProfileIconPicker.tsx`, rendered in viewer and list rows.
- [x] Attachments editor: type detection, add/remove, 24 MiB data-URL cap — legacy `L7562-7670`; `frontend/src/features/editor/AttachmentsEditor.tsx`.
- [ ] Inline media upload inside rich text (`#inline-file-upload`, blob → data URL on save) — legacy `L7007-7030`, `L7582`: planned.
- [ ] Window manager (shadow-DOM card windows, per-window geometry/zoom/preferences, workspace restore, read↔edit handoff) and unified create window with draft promotion — legacy `L9233-11562`: planned; replaced by React modals.
- [ ] Wiki-links `[[target#N|title]]`, backlinks panel, revisions with word-LCS diff and restore — legacy `L15731-16260`: planned.

## 4. Data I/O + guided tour (`L13142-15168`)

- [x] Export JSON full vs selection: checklist pick (a checked edge pulls both endpoints, so no export contains a dangling edge), filename `ruang-informasi-3d_{semua|pilihan}_{YYYYMMDD-HHmm}.json`, scope help text verbatim — legacy `L13416-13475`; `frontend/src/features/dataio/DataIOModal.tsx:33-49,241-310`.
- [x] Full export built in Go (trash, knowledge collections, camera, tour, `fase2`); a selection export is assembled client-side with `scope: 'selection'` — `backend/internal/service/import.go:31-64`, `frontend/src/features/dataio/DataIOModal.tsx:257-298`.
- [x] Markdown `Ringkasan Progress` report: counts, kinds, relations, orphan list, per-object connections — legacy `L13476-13565`; `frontend/src/features/dataio/markdownSummary.ts`.
- [x] Copy to clipboard with the legacy `document.execCommand('copy')` fallback, plus Web Share fallback — legacy `L14409-14427`; `frontend/src/features/dataio/DataIOModal.tsx:68-89,333-345`.
- [x] Import: 64 MiB guard, read-only preflight preview (scope, counts, warnings), merge/replace, placement rules with offsets and "avoid overlap", server verdict shown and the workspace re-fetched on success — legacy `L13990-14555`; `frontend/src/features/dataio/DataIOModal.tsx:378-500`, `backend/internal/service/import.go`.
- [x] Recovery snapshots in the data panel: list with reason/time/size, manual create, restore (exact replacement) and delete, all confirm-gated — legacy IndexedDB snapshot layer `L28229-29231`; `frontend/src/features/dataio/DataIOModal.tsx:502-555,855-900`.
- [ ] Guided tour designer/player (auto-compose DFS/BFS/creation order, manual add, per-step title/note/dwell/camera, `arc|line|cut` flights, loop, segmented progress, keyboard control) — legacy `L14699-15168`: planned; the `tour` field travels through store, envelope and server untouched.
- [ ] Fase 1 chrome markup hosts (`#p1-hint`, `#p1-gesture`, `#p1-minimap`) — legacy `L17487-17539`: superseded by React components.

## 5. Export/docs: FX, wiki-links, revisions, reports, UX layers (`L15169-17540`)

- [x] Animated fly-to camera (cubic ease, distance-scaled duration, instant under reduced motion) — legacy `L17262-17280`; `frontend/src/three/engine.ts:672-699`.
- [x] Focus/dim behaviour on open or focus (object + neighbours stay lit) — legacy `L15341-15390`; `frontend/src/three/engine.ts:562-618`.
- [x] Modal focus trap, Escape handling, focus restore; polite toast live region; dialog ARIA — legacy `L17285-17538`; `frontend/src/ui/Modal.tsx`, `frontend/src/ui/Toasts.tsx`.
- [~] Unsaved-changes guard and backup reminder: the editor modal confirms before discarding a draft and the store tracks `dirty` (pill + Ctrl+S), but there is no `beforeunload` guard or "export to clear dirty" reminder — legacy `L16466-16527`, `L17392-17455`.
- [ ] Implode delete FX and TransformControls drag FX (wire ring, trail, ghost spheres) — legacy `L15203-15275`, `L15400-15490`: planned; deletion is instant.
- [ ] Rubber-band connect preview while a connect source is chosen — legacy `L15277-15340`: planned.
- [ ] View-modal entrance stagger, page slide-out and animated formula preview — legacy `L15580-15616`: planned.
- [ ] Word/PDF report generator (`Laporan_<slug>_<date>.doc`, print-to-PDF iframe, cover + TOC per item) — legacy `L16263-16454`: planned. The Markdown `Ringkasan Progress` export (area 4) is a reading report, not this generator.
- [ ] Wiki-link autocomplete in the editor, backlink chips, revision history modal (`Pulihkan`) — legacy `L15871-16260`: planned.
- [ ] Floating selection toolbar and `/tex` `/math` slash commands — legacy `L16864-17046`: planned (the rich-text tab panel and LaTeX insert field cover part of it).

## 6. Fase 1: touch, hints, label collision, minimap (`L17540-19316`)

- [x] Minimap: 2D canvas with `Atas`/`Depan`/`Sisi` projections, adaptive grid, coloured axes, nodes/edges, camera dot + dashed target line, caption with visible ranges, throttled redraw behind a change signature, click-to-fly-to-cell, collapse to a launcher, visibility toggle via `M` — legacy `L18564-19220`; `frontend/src/features/minimap/Minimap.tsx`, `frontend/src/store/uiStore.ts`, `frontend/src/ui/useGlobalShortcuts.ts`.
- [x] Workspace UI preferences (`hints`, `minimap`, `minimapCollapsed`, `minimapView`, `labelCollision`, `touchGestures`) exist in `appStore.ui`, replacing the legacy `ri3d-fase1` localStorage key — legacy `L17560-17583`.
- [ ] Two-finger touch gestures (pinch dolly, twist azimuth, two-finger pan, tap guard) — legacy `L17662-17862`: planned; OrbitControls default touch handling is used and the engine ignores pointer moves >6 px.
- [ ] Contextual per-mode hints/tooltip (`#p1-hint`) with step badges and touch docking — legacy `L17871-18116`: planned.
- [ ] Label anti-collision solver (greedy 8-direction placement, sticky offsets, hide-mode fading) — legacy `L18129-18561`: planned; sprites already carry priorities so it can plug in.
- [ ] Minimap extras beyond the basics: drag scrub, wheel zoom, compass reset, fit button, keyboard cursor, FOV cone, D-pad interplay — legacy `L18640-19256`: planned.
- [ ] Preferences menu toggles for minimap/hints/label-collision/gestures — legacy `L19227-19256`: planned (no menu UI; preferences are only in the store).

## 7. Fase 2: physics, clusters, containers (`L19457-22952`)

- [ ] d3-force-3d simulation plus JS fallback engine, force sliders, quick layout/shake/undo/reset, status chip (`Mati/Menata/Stabil/Hidup`) — legacy `L19776-20184`: planned.
- [ ] Cluster detection (label TF-IDF / spatial Epanechnikov / hybrid + Louvain), stable ids/colours, legend with rename, apply/restore node colours, glow/bubble visualisation, auto-cluster — legacy `L20501-21019`: planned.
- [ ] Container behaviour and UI: member picking, fit mode, layouts `free|grid|ring|stack|sphere`, confine/keepOut walls, pad/opacity/label properties, unresolved-member reconciliation dialog — legacy `L21033-22456`: planned (mesh shell only, see area 2).
- [ ] `fase2` export/import: pass-through only today — the field travels through store, envelope and database (`frontend/src/store/appStore.ts`, `backend/internal/models/models.go`) with no UI.

## 8. Fase 3/4: heatmap, analytics, watchers, cloud, diff (`L22954-24555`)

- [x] Variable-change watcher equivalent: the recompute bridge diffs recomputed values and writes `mathValue`s back into the graph; the global-variables modal lists definers, conflicts and unresolved deps — legacy `L23872-23955`; `frontend/src/features/formula/recomputeBridge.ts`, `recalc.ts`, `GlobalVarsModal.tsx`.
- [ ] Voxel heatmap layer (`InstancedMesh`, metrics, palettes, shapes, instance caps, through-objects mode) — legacy `L23064-23296`: planned.
- [ ] Volumetric dashboard `Dasbor Volumetrik` (metrics, densest sectors, peaks) — legacy `L23232-23428`: planned.
- [ ] d3 relation-matrix and density-heatmap export as SVG/PNG 2× — legacy `L23599-23814`: planned.
- [ ] High-resolution PNG snapshot of the scene with watermark — legacy `L24037-24084`: planned.
- [ ] Visual graph diff against a session baseline or uploaded JSON — legacy `L24085-24185`: planned.
- [ ] Firebase Firestore cloud workspace, share modes and `#workspace=<id>` links — legacy `L24183-24441`: deliberately replaced by the Go backend (see deviations).

## 9. Epistemic schema, validator, workbench, audit (`L24557-25583`)

- [x] Schema V2 catalogue ported verbatim: 8 relation statuses, 17 node kinds, 20 relation types with Indonesian labels, descriptions, allowed source/target kinds, diagram paths and field specs — legacy `L5446-5809`; `frontend/src/features/epistemic/schemaV2.catalog.ts:6-168`.
- [x] Relation validator and builder: type/status checks, `custom` requires a custom label, unknown types/statuses kept with warnings, source/target kind mismatches reported as warnings, sourceRefs resolved against the subgraph with unresolved snapshots preserved — legacy `L5763-5789`, `L8880-8900`; `frontend/src/features/epistemic/validate.ts` (`validateEpistemicRelation`, `buildEpistemicRelation`).
- [x] Read surfaces render node metadata and annotated edge relations, including `sourceRefs` with `unresolved`/`titleSnapshot` markers — `frontend/src/features/view/ViewModal.tsx:334-470`.
- [x] Edit surfaces cover kind, status, scope/assumptions/limitations/provenance and relation type, custom label, status, rationale, qualifier, source references — `frontend/src/features/editor/EpistemicMetaPanel.tsx`, `EdgeRelationPanel.tsx`.
- [x] Import/export of annotated relations is verbatim, with server-side `sourceRefs` remap and unresolved marking for references outside the payload — `backend/internal/service/import.go:395-478` and tests.
- [ ] Knowledge workbench (epistemic decision history, learning episodes, action cycles, reference audit, `Laporan .md` trail export) — legacy `L24557-25149`: planned; the store carries the three collections and the server persists them, but no UI exists.
- [ ] Audit v2 modal (logical/empirical cycle map, traceability findings with severity filters and search, audit JSON export) — legacy `L25152-25583`: planned.

## 10. Themes, deep customization, trails, command palette (`L25585-28227`)

- [ ] Theme modal: 13 visual concepts, accent swatches, surface materials (native/glass/paper/solid), opacity/warmth/texture, density/contrast/motion, scene fog and light application, theme JSON export/import, reset — legacy `L25585-25906`: planned; the new UI ships one Tailwind surface style instead.
- [ ] Deep customization sections 05–11 (custom palette, typography/scale/radius/shadow/blur, dock position and toolbar scale, 3D grid/opacity/edge styling, camera sensitivity, trails, resets) — legacy `L25910-26336`: planned.
- [ ] Object trails (session-only 3D path trails with style/scope/fade/sampling/eviction) — legacy `L26584-26759`: planned.
- [ ] Settings organizer (category tabs, accordion rebuild, per-category search) — legacy `L26350-26533`: planned; React ships separate modals instead.
- [ ] UI organizers and floating icon tooltips (`data-hover-label`/`data-help`) — legacy `L26802-27344`: planned (controls have labels/aria; no tooltip layer).
- [ ] Command palette `Ctrl/Cmd+Shift+P` over menu entries, known control roots and destinations — legacy `L27615-28227`: planned; global shortcuts cover `1-4`, `N`, `/`, `Ctrl+K`, `M`, `Esc`, `Ctrl+S`.

## 11. Persistence, profile, description tools, flow sessions (`L28229-31021`)

- [x] Whole-workspace autosave: any graph mutation marks the store dirty and schedules a debounced server write; `Ctrl+S` saves immediately; the pill reports saving/saved/error — replaces the legacy IndexedDB autosave (`AUTOSAVE_VERSION 1`, 900 ms delay, scope-keyed snapshots) — `frontend/src/store/appStore.ts:208-580`, `frontend/src/App.tsx`.
- [x] Recovery points via the API (create/list/restore/delete, 30 retained) instead of the legacy IndexedDB store with quarantine and blocked scopes — `frontend/src/features/dataio/DataIOModal.tsx:502-555,855-900`, `backend/internal/store/store.go:140-211`.
- [x] Profile customizer fields and avatar rendering in editor, viewer and list rows — legacy `L29277-29510`; `frontend/src/features/editor/ProfileIconPicker.tsx`.
- [x] Description tools: page style panel with presets and apply-to-all, find next/replace one/replace all, statistics, HTML source apply, sanitization on read/paste/apply — legacy `L29538-29902`; `frontend/src/features/editor/RichTextEditor.tsx`.
- [~] `Ctrl/Cmd+S` save ported; the legacy `visibilitychange` tab-hidden final save is not (the debounced autosave covers ordinary use) — legacy `L17460`, `L28691-28695`.
- [ ] Guided session flows: 9 route cards × 5 steps, progress window, spotlight and story guide modes, persisted session state — legacy `L30157-31023`: planned.
- [ ] Responsive nav tweaks and contextual help text (`data-help`) from the D01/D02 patch — legacy `L29964-30056`: superseded by React layout and ARIA labels.

## 12. Tail patches: master centre, parity, CSS stages (`L31023-32960`)

- [x] Selection highlight frame from the legacy core is ported as a three.js projector — `frontend/src/three/selectionFocus.ts` (legacy `L5866-5957`), styled by React classes instead of stage-4 CSS.
- [x] Description settings tabs and compact toolbar controls are ported in spirit as the rich-text editor's tab panel — `frontend/src/features/editor/RichTextEditor.tsx` (legacy `L31721-31753`).
- [ ] Master control centre `Pusat kontrol` (two-pane tools/settings dialog with legacy modals folded in as accordions, switch rows for preferences, focus trap) — legacy `L31206-31653`: planned; the React toolbar and separate modals expose the same entry points directly.
- [ ] Collectible card, `ri3d-holo-section` prism marks, global-window parallax/tilt, pane entrance animations and the CSS-only stages (same-window editor, density, scroll ownership, selection frame, transform ownership) — legacy `L31674-32960`: deliberately dropped; the new UI uses Tailwind panels and one modal shell.

## 13. Markup & CSS shell, modals, i18n (`L3267-5445`)

- [x] Left tool rail with the four modes, snap toggle and extra-tools drawer, labels kept in Indonesian (`Pointer (Buka Info)`, `Pindah Objek (Geser)`, `Hubungkan Garis`, `Hapus Objek / Garis`) — legacy `L3271-3330`; `frontend/src/ui/VerticalToolbar.tsx`.
- [x] Modal shell with Escape close, Tab trap, focus restore, `role="dialog"`/`aria-modal` and backdrop dismissal; confirm dialog replacing `window.ri3dConfirm`; polite toast live region — `frontend/src/ui/Modal.tsx`, `ConfirmDialog.tsx`, `Toasts.tsx` (legacy `L3160-3266`, `L5441-5443`).
- [x] Three-way delete prompt `Arsipkan` / `Hapus permanen` / cancel — legacy `L5122-5152`; `frontend/src/ui/DeleteChoiceDialog.tsx`.
- [x] Entry points for every surface: object list, search, data I/O, trash, space settings, syntax dictionary, math evaluator, global variables, snap, auto-arrange, reset camera — legacy `L3396-3490`, `L3271-3330`; `frontend/src/ui/VerticalToolbar.tsx`, `frontend/src/App.tsx`, `frontend/src/store/uiStore.ts` (single-visible-surface rule).
- [~] Panel parity: every legacy panel has a React counterpart, but the D-pad button (`dpad-container`) is not ported (keyboard WASD covers movement).
- [~] i18n unchanged by design: the app stays Indonesian-only (`<html lang="id">`) and the React code likewise hardcodes Indonesian, using `toLocaleString('id-ID')`/`localeCompare('id')` where the legacy did.
- [ ] Space-settings deep controls beyond the ported set (per-axis size/step/thickness/opacity, Y± sub-options, grid-Y dropdown, drop-line colour/opacity) — legacy `L4658-5116`: partially ported; the shipped modal covers limits, grid size/Y, fog, planes, labels, drop-line toggle, voxel density and lights.

## Known deliberate deviations

1. **Cloud workspace: Firestore → Go backend.** The legacy Firebase/Firestore workspace (`workspaces/{id}` docs with `payloadJson`, `ownerUid`, `shareMode`, `#workspace=<id>` links, 850 KiB cap, anonymous auth, `L24183-24441`) is replaced by the local Go API. No Firebase dependency exists anywhere in the repository; share links are gone.
2. **localStorage/IndexedDB → server persistence + snapshots.** Legacy per-scope IndexedDB autosave, corrupt-snapshot quarantine, blocked scopes and Firestore mirroring (`L28229-29231`) become a debounced `PUT /workspaces/:id/graph` plus server snapshots (30 retained). Validation runs server-side before the write transaction (`backend/internal/schema/envelope.go`, `store.SaveGraph`), so client-side quarantine has no peer.
3. **Import pipeline moved server-side.** The legacy client importer validated, snapshotted, remapped ids, placed nodes, applied/rolled back and then committed (`L13990-14555`). `PlanImport` now computes the whole outcome in Go and the handler writes it in one transaction; the panel only does a read-only preflight and renders the verdict (`DataIOModal.tsx` header comment). Atomicity is stronger than the JS snapshot/rollback.
4. **Window-manager shadow-DOM cards → React modals.** `RI3DWindowManager` card windows, per-window geometry/zoom/preference persistence and the workspace registry (`L9233-11487`) become one `ui/Modal.tsx` shell per surface; no window geometry, z-order or per-window render profile is persisted.
5. **Legacy DOM patch layering → React components and stores.** The 22+ "Fase/Tahap" scripts re-wrapped globals (`openEditForm`, `openViewModal`, `flyTo`, `processDel`) and re-parented DOM nodes; now components subscribe to `appStore`/`uiStore`/`spaceStore` and the engine subscribes to the store instead of reacting to DOM mutations.
6. **Master control centre, holo card, parity and CSS-only stages dropped.** The `Pusat kontrol` dialog, `ri3d-holo-section` prism marks, window parallax/tilt and the stage 1–5 CSS layers (`L31023-32960`) are not ported; the new UI uses ordinary Tailwind panels and a static save-state pill.
7. **`execCommand` rich text kept on purpose.** The description editor still formats through `document.execCommand` for behaviour parity (`RichTextEditor.tsx` header comment) and the data panel's clipboard fallback still calls `document.execCommand('copy')` (`DataIOModal.tsx:68-89`); the sanitizer normalizes the `<font>` elements `execCommand('fontName'|'fontSize')` emits (`richTextHtml.ts:211-...`).
8. **Appearance preferences are in-memory stores, not localStorage keys.** `ri3d-fase1`, `ri3d-fase2`, `ri3d-theme-settings-v1`, `ri3d-deep-customization-v1`, `ri3d-flow-session-v1`-style keys are replaced by `frontend/src/store/spaceStore.ts` (grid/fog/axes/voxel/lights) and `uiStore` (modals, snap, minimap visibility); the engine applies them live and they are not yet persisted across reloads.
9. **CDN shims and fallbacks removed.** The `math` shim for a failed mathjs load, the custom physics fallback engine and CDN library polling (`checkLib`) have no equivalent: `three`, `mathjs` and `katex` are real npm dependencies and the app boots only from the backend (`App.tsx` retries the API instead of polling libraries).
10. **Ids and deferred features kept schema-compatible.** The legacy id scheme and collision avoidance versus active objects *and* trash are preserved (`nextNodeId`/`nextEdgeId`), and `fase2`/`tour`/knowledge collections travel through the schema untouched so later stages need no data migration.
11. **Voxel space ≠ heatmap.** The space-settings voxel option is the plain reference point grid (legacy `confVoxel`), not Fase 3's instanced heatmap.

## How to verify a stage

- `make test` — Go test suite (`go test ./...`), including the import planner tests in `backend/internal/service/import_test.go`.
- `make typecheck` — frontend TypeScript build (`tsc -b`).
- `make build` — frontend bundle built and embedded into the single Go binary (`build-frontend` + `build-backend -tags prod`).
- `make dev` — backend on `127.0.0.1:8787` plus the Vite dev server on `:5173` for manual checks.
- **Graph/editor:** press `N`, edit identity/epistemic/labels/pages, tool `2` drag (writes `posX/Y/Z`), tool `3` connect two nodes, tool `4` archive a node and restore it from `Tempat sampah`; the pill must end `Tersimpan`.
- **Data I/O:** export full JSON and a selection (check that edges pull their endpoints), import the file with `Gabung` and `Ganti` plus placement rules, create/restore/delete a snapshot in the panel.
- **Formula:** give a node a `mathExpression` referencing a variable defined by a connected node and check the viewer math line, the edge variable chips and the `Variabel global` modal.
- **Epistemic:** annotate an edge relation with source references, export, re-import and confirm the relation survives with out-of-scope references flagged unresolved.
- After any stage, `git status` should list only intentionally changed files; `legacy/` must stay untouched.
