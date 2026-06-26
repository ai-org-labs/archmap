# ArchMap — AOF Shared Development State

This is the **single shared source of development state** for ArchMap, used so
multiple agents (Claude Code and Codex) can work **alternately** on the same
project without losing context. Read this file first; update the Handoff log
before ending a session.

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

- 2026-06-26 — **Claude** — Vendored specs, created this AOF state doc, set Stage tasks (#10–#13), reconciled #8/#9. Current stage: **Stage 1 (parse)** about to start. Tests: 55 passing. Next action: implement pair-key edge parsing + `${from}__${to}__${index}` ids + `edge_pair_ambiguous` (Stage 1).
