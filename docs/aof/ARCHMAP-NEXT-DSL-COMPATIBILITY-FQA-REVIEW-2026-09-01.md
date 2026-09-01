# ArchMap Next DSL Compatibility FQA Review

Date: 2026-09-01  
Reviewer: Codex  
Scope: native `topology:` syntax, released DSL compatibility, and migration readiness

## Verdict

**Conditional Pass**

- Native `topology:` documents are analysis-ready for ArchMap Next.
- Released DSL documents remain parseable and renderable without rewriting.
- Released DSL can be structurally normalized with provenance retained.
- Released DSL is **not automatically trustworthy for Crossing analysis**, because a legacy graph edge may be a conceptual shortcut rather than an actual direct Resource-to-Resource communication.

The syntax change is additive. Existing documents are reusable for existing views, but semantic reuse in Next analysis requires an explicit review state.

## First Unanswered Question

> When a released DSL document is normalized, who confirms that every legacy edge represents an actual direct communication, and where is that confirmation recorded and shown?

This is the first question that blocks an unqualified compatibility claim. The parser cannot infer the answer from geometry, labels, or `boundaryCrossing`.

## Evidence

The official First Question Agent v0.1.0 CLI was run against `docs/specs/next/13-compatibility-and-migration.md` and returned:

```json
{
  "question": null,
  "status": "sufficiently_defined",
  "agents_used": ["journey"],
  "selection_reason": "Natural Continuation and eligible risk probes found no next decision requiring clarification.",
  "evidence_gaps": []
}
```

This establishes that the written migration specification is internally sufficiently defined. It does not establish implementation completeness or semantic correctness of individual legacy documents.

`npm run verify:next` passed:

- typecheck passed;
- 31 test files and 333 tests passed;
- production build passed;
- deterministic topology benchmark passed at 120 and 1,000 Resources.

## Findings

### FQA-01 High: legacy semantic readiness is not represented

`normalizeTopology()` converts every legacy edge with known endpoints into a canonical topology edge. The compatibility specification correctly calls these edges "direct communication candidates", but the model has no `unreviewed` or equivalent state.

Result: a conceptual shortcut such as `Client -> API`, where the real path is `Client -> LoadBalancer -> API`, can produce precise-looking but incorrect Crossing results.

### FQA-02 Medium: migration diagnostics are not visible in the normal analysis path

The normalizer returns provenance and migration diagnostics. The renderer's crossing projection consumes the normalized topology but does not merge those diagnostics into the public model diagnostics or expose a migration-readiness banner.

Result: migration is observable to a direct API caller, but not reliably observable to a user selecting a Next analysis view.

### FQA-03 Medium: diagnostic wording overstates certainty

The specification says legacy edges are communication **candidates**. The `legacy_topology_normalized` diagnostic says they are "direct communication Edges".

Result: the runtime message communicates a stronger guarantee than the migration contract provides.

### FQA-04 Low: delivery bundle remains a performance risk

The release gate passes, but the lifecycle site chunk is approximately 3.16 MB before compression and 923 KB gzip. This does not block DSL compatibility, but it remains relevant to interactive sample-site performance.

## Required Next Gate

Implement a legacy semantic-readiness gate before calling released DSL fully analysis-compatible.

Acceptance criteria:

1. Existing documents continue to parse and render unchanged.
2. Native `topology:` is analysis-ready by construction after structural validation.
3. Normalized legacy topology defaults to an explicit `legacy-unreviewed` state.
4. Crossing analysis requested for unreviewed legacy topology emits a visible warning.
5. An explicit document or API attestation can promote it to `legacy-reviewed`.
6. Normalization diagnostics and provenance are exposed through the public analysis result and viewer diagnostics.
7. Runtime wording consistently distinguishes candidates from confirmed direct communication.
8. Tests prove that no legacy edge silently becomes trusted semantic truth.

## Compatibility Answer

| Use | Native `topology:` | Released DSL |
| --- | --- | --- |
| Parse | Pass | Pass |
| Existing Overview/Topology rendering | Pass | Pass |
| Structural normalization | Not needed | Pass with provenance |
| Derived Crossing analysis | Pass after validation | Conditional on edge review |
| New document authoring | Recommended | Supported, not preferred for Next semantics |

The released syntax is reusable. New ArchMap Next documents should use `topology:` when Container ownership, direct communication, Crossings, or Overlay Transitions are intended to be authoritative.
