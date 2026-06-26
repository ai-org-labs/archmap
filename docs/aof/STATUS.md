# ArchMap — AOF Shared Development State

The primary shared runtime state is now **[`.aof/`](../../.aof/)**. This file is
the human-readable status bridge for ArchMap, used so multiple agents (Claude
Code and Codex) can work **alternately** without losing context. Read `.aof`
project bootstrap/orientation/goals/tasks first, then this file for narrative
handoff detail; update `.aof` and the Handoff log before ending a session.

- Frameworks: **AOF v6.4.0** (https://github.com/ai-org-labs/ai-organization-framework/tree/v6.4.0) · **QIF v0.3.0** (https://github.com/ai-org-labs/quality-intent-framework/tree/v0.3.0)
- Authoritative specs (in repo): [`docs/specs/v0.1/`](../specs/v0.1/) — authority order: product-principles → model-validation → dsl-syntax → views-rendering → engine-api
- Implemented-syntax reference: [`docs/SYNTAX.md`](../SYNTAX.md)

---

## Request framing (AOF)

- **Need:** the codebase predates the consolidated v0.1 spec set; align it to the specs.
- **Intent:** one canonical model drives base views (overview/zone/3d) + overlays (auth/dataflow/boundary/permission/validation); beautiful, readable rendering; trustworthy diagnostics.
- **Context:** working v0.1-ish impl exists (parser, layout w/ swimlanes + orthogonal routing, 6 views, opt-in icons via @archmap/icons, opt-in 3D). Spec introduces: canonical model as `Record`s, 4-level diagnostics `{level,code,message,ref,target}`, pair-key edges `A->B:`, edge id `${from}__${to}__${index}`, `boundaryCrossing` object, zone `parent`/nesting + cycles, `placement`, base-view/overlay split, expanded vocab + inference.

## Governance check (AOF — apply per task)

1. value/intent · 2. feasibility/execution · 3. risk/quality/safety. Run each task as **goal + execution + verification + stop-condition**. QIF: judge by quality-intent/risk/loss, not volume; separate **completion** (built+tested) from **success** (meets intent, verified).

---

## Implementation plan — order: parse → normalize → diagnostics → overview

Migrate incrementally; keep the product working and tests green at each step.

### Stage 1 — Parse (DSL → raw graph + metadata)  [task #10]
- Graph subset (dirs, 4 shapes, edges, subgraph, comments) — already present.
- **Add:** pair-key edges `A->B:` as selectors; explicit-id edges (from/to); generated edge id `${from}__${to}__${index}`; `edge_pair_ambiguous`.
- Completion: pair-key + explicit-id parse; generated ids; unit tests.
- Success: spec §6 edge identity rules hold on examples; no regression.

### Stage 2 — Normalize (→ canonical model)  [task #11]
- Canonical `Record`-keyed model (02 §4). Merge graph+metadata; `boundaryCrossing` object; data relation normalization (`edge.dataIds` ⇄ `data.flows`); zone `parent`/`resolvedContains`/nesting; `placement`; node `resolvedZone`; inference additions (metrics/logs/scan/vpn).
- Completion: canonical model shape produced; reference resolution; tests.
- Success: 02 normalization pipeline §2 reproduced; primary-zone resolution order correct.

### Stage 3 — Diagnostics (4-level)  [task #12]
- `{level,code,message,ref,target}`; `diagnostics` + derived `errors/warnings/suggestions/infos`; full code registry (02 §17); flow-sensitive auth (§18); boundary/zone/data/permission/vocab rules.
- Completion: all registry codes emitted where applicable; tests.
- Success: 02 acceptance §25 holds; warnings never block render.

### Stage 4 — Overview render (base view + overlay scaffolding)  [task #13]
- `render(model,{baseView,overlays})`; overview base view from canonical model; overlays as toggled projections (no reparse). Reuse existing layout/routing.
- Completion: baseView+overlays API; overview renders canonical model; overlays combine.
- Success: 03 acceptance §10 (overview + overlay combination) holds; legibility invariants kept (no edge over node, no shared endpoints).

Later (not this epic's first pass): zone view per 03 §3.2 (nested zones), 3D per 03 §3.3 (X=zone/Y=layer/Z=order), engine API (04), inspector/UI.

### Backlog reconciliation vs spec
- `#8` zone nesting → **core (in-scope)** via Stage 2/zone-view; node `contains` nesting stays backlog (spec §2.3).
- `#9` 4D/timeline → **v0.1 non-goal** (spec §9); keep parked.

---

## Decision log (AOF: Decision → rationale → outcome)

- 2026-06-26 — Adopt archmap-specs-v0.1 as authoritative; vendor into `docs/specs/v0.1/`. Implement in order parse→normalize→diagnostics→overview. Migrate incrementally (not a from-scratch rewrite) to protect the working product (QIF loss-boundary: unreadable/unusable output). Base/overlay split replaces the flat view registry over Stages 3–4.

---

## Handoff log (update at end of every session)

- 2026-06-26 — **Claude** — Vendored specs, created this AOF state doc, set Stage tasks (#10–#13), reconciled #8/#9. Tests: 55 passing.
- 2026-06-26 — **Claude** — **Stage 1 (parse) DONE** (task #10). Added pair-key edge form `A->B:` (selector that enriches the matching graph edge), explicit-id form unchanged, generated graph-edge ids `${from}__${to}__${index}`, `edge_pair_ambiguous`, and edge fields `pairKey`/`source`/`graphLabel` on `ArchEdge` (types.ts). Impl: src/parser/metadata.ts. Tests: 58 passing (3 new pair-key tests in test/parser.test.ts). SYNTAX.md updated. **Next: Stage 2 (normalize)** — start with the canonical `Record`-keyed model shape and `boundaryCrossing` object + data-relation normalization (task #11). Note: diagnostics still use the OLD `{severity, ref:{kind,id}}` shape; the 4-level `{level,code,message,ref,target}` migration is Stage 3 (#12) — keep new diagnostics in the old shape until then, or coordinate the switch.
- 2026-06-27 — **Codex** — **Stage 2 (normalize) STARTED**. Added a Stage 2 normalization pass in `src/parser/metadata.ts` while preserving the existing array-based public model for render compatibility: `boundaryCrossing` now normalizes to `{crosses, reviewed, assertedFalse?}`; `edges.*.data` and `data.*.flows` normalize into `edge.dataIds` plus stable `data.flows`; pair-key flow refs resolve to generated/explicit edge IDs; zones/boundaries gain `resolvedContains`; nodes gain `resolvedZone`; parsed `placement`, zone `parent`/`owner`, and data `storage`. Updated boundary view + validation to use `resolvedZone` and canonical boundary crossing, including `zone_crossing_marked_false`. Tests: `npm run typecheck`, `npm test` (61 passing), `npm run build`. **Next:** continue Stage 2 with full canonical `Record`-keyed model shape or a compatibility adapter, zone parent/cycle/parent-contains diagnostics, `data_flow_mismatch`, and richer placement-derived zone inference.
- 2026-06-27 — **Codex** — **Stage 2 continued**. Added `toCanonicalModel()` (`src/canonical.ts`, exported from `src/index.ts`) to project the compatibility array model into the spec §4 Record-keyed canonical shape for AOF/runtime consumers without breaking existing renderers. Extended zone normalization with parent-derived child links, `zone_parent_unknown`, `zone_parent_conflict`, and `zone_cycle`; fixed zone/boundary validation to accept zone containment refs. Added `data_flow_mismatch` when edge-side `data` and data-side `flows` disagree before normalization. Tests added in `test/canonical.test.ts` and `test/parser.test.ts`. Tests: `npm run typecheck`, `npm test` (65 passing), `npm run build`. **Next:** Stage 2 remaining gaps are full source/subgraph preservation in canonical output, placement-derived zone inference, more exact unknown child-zone diagnostics, and then Stage 3 diagnostics shape migration.
- 2026-06-27 — **Codex** — **AOF runtime state initialized**. Created `.aof/` with AOF v3.1.0 `init --topology managed-project --install-mode runtime-on`, projected goals into `.aof/goals/`, and opened runtime tasks: `TASK-001` Stage 2 normalize, `TASK-002` Stage 4 overview overlays, `TASK-003` Stage 3 diagnostics. Replaced placeholder `.aof/context/active/project-orientation.json` content with ArchMap-specific boundaries, protected areas, required commands, verification entrypoints, and approval boundary. Verified with `aof organization-verify --project .` (22/22 pass) and `aof roadmap-status --project .`. **Operational change:** future Claude/Codex sessions should read `.aof/project-bootstrap.json`, `.aof/context/active/project-orientation.json`, `.aof/goals/*.json`, and `.aof/tasks/open/*.json` before this narrative STATUS to reduce repeated prompt/context cost.
- 2026-06-27 — **Codex** — **Stage 2 DONE / Stage 3 STARTED**. Completed `.aof` `TASK-001`: canonical output now preserves `source` and graph `subgraphs`; `toCanonicalModel()` returns Record-keyed collections plus source/subgraphs; `placement.zone` can infer `node.zone`/`resolvedZone` when it references a known zone; unknown zone containment distinguishes `zone_unknown_child_zone` from `zone_unknown_node`; edge inference now covers metrics/logs/security scan/vpn hints and expanded flow vocabulary. Started `.aof` `TASK-003` with diagnostics scaffolding: `ArchMapModel` now has `diagnostics`, `suggestions`, `infos`, and compatibility `level`/`target` fields derived from existing `errors`/`warnings`. Tests: `npm run typecheck`, `npm test` (69 passing), `npm run build`; `aof organization-verify --project .` remains 22/22 pass. **Next:** continue `TASK-003` by migrating diagnostic constructors to native `{level, code, message, ref, target}`, moving suggestion/info-level codes out of warnings, and covering the registry acceptance tests.
- 2026-06-27 — **Codex** — **Stage 3 advanced + dev server kept visible**. Started Vite dev server for continuous visibility; active URL for this run: `http://127.0.0.1:4174/` (verified by `lsof` listen; sandbox `curl` could not connect despite listener). Added `src/diagnostics.ts` registry normalization so `model.diagnostics` is the canonical combined list and level arrays are derived by code registry; `target` now uses spec-shaped `{type,id}` while legacy `ref` remains for compatibility. Validation view now reads `model.diagnostics`/`target`. Suggestion/info codes now land in `suggestions`/`infos` (`node_without_metadata`, `missing_direction`, `node_zone_unknown`, `data_without_classification`, `dataflow_missing_storage`, `placement_ref_unknown`, inference infos). Updated `docs/SYNTAX.md`. Tests: `npm run typecheck`, `npm test` (70 passing), `npm run build`; `aof organization-verify --project .` 22/22 pass. **Next:** keep `TASK-003` open; migrate individual diagnostic constructors to native helpers and expand remaining registry coverage (auth issuer/validator refs, boundary zone/boundary-specific unknown refs, classification vocab, telemetry suggestions).
- 2026-06-27 — **Codex** — **Stage 3 registry coverage expanded**. Kept Vite visible at `http://127.0.0.1:4174/` (`lsof` confirms listener). Added native `diagnostic()` helper and used it for new diagnostics; parsed `auth.recipient`; added flow-sensitive auth coverage (`auth_flow_without_token`, token issue/validate issuer/validator/recipient rules, unknown auth refs), boundary coverage (`unknown_boundary_kind`, `boundary_unknown_related_zone`, boundary/node/zone-specific unknown contains refs, `boundary_cycle`), data coverage (`unknown_classification`, `data.processedBy` unknown nodes), and telemetry suggestion (`telemetry_without_data_classification`). Updated `docs/SYNTAX.md` registry list. Tests: `npm run typecheck`, `npm test` (74 passing), `npm run build`; `aof organization-verify --project .` 22/22 pass. **Next:** `TASK-003` remains open for converting older parser/metadata/validate pushes to `diagnostic()` helpers and considering remaining vocab registries like zone/identity kind.
- 2026-06-27 — **Codex** — **Stage 3 helper migration advanced**. `validate.ts`, `parser/metadata.ts`, and `parser/graph.ts` now use `diagnostic()` helper instead of object-literal `{severity, ref}` pushes; added `STANDARD_ZONE_KINDS` and `STANDARD_IDENTITY_KINDS` plus `unknown_zone_kind` / `unknown_identity_kind` validation and tests. Vite remains visible at `http://127.0.0.1:4174/`. Tests: `npm run typecheck`, `npm test` (74 passing), `npm run build`; `aof organization-verify --project .` 22/22 pass. **Next:** before closing `TASK-003`, decide whether renderer/view diagnostics (`unknown_base_view`, `unknown_overlay`, `view_3d_unavailable`, `src_fetch_failed`) belong here or should be deferred to `TASK-002` / engine API work.
- 2026-06-27 — **Codex** — **Stage 3 DONE / Stage 4 STARTED**. Closed `.aof` `TASK-003`: diagnostics now use the native helper path across parser/validate/render, sync to canonical `diagnostics` plus derived `errors`/`warnings`/`suggestions`/`infos`, and include view-facing codes (`unknown_base_view`, `unknown_overlay`, `view_3d_unavailable` registered). Started `.aof` `TASK-002`: `render(model,{baseView,overlays})` now coexists with legacy `render(model,{view})`; baseView selects the registered renderer, overlay names are validated without reparsing, known overlays are stamped onto the SVG root (`data-overlays`, `archmap-overlay-*`), and unknown overlays emit non-blocking diagnostics. Vite remains visible at `http://127.0.0.1:4174/` (PID 59152). Tests: `npm run typecheck`, `npm test` (76 passing), `npm run build`; `aof organization-verify --project .` 22/22 pass. **Next:** continue `TASK-002` by turning the scaffold into real overlay projection composition on overview (auth/dataflow/boundary first, then validation/permission) while preserving legacy flat views.
