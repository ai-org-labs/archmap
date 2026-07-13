# ArchMap v0.4 MVP Acceptance Matrix

Scope: `@archmap/lifecycle` login/checkout vertical slice on the v0.3 Core
plugin API. This matrix records executable evidence; it does not claim npm
publication or later readiness/gate features.

| ID | Status | Evidence |
| --- | --- | --- |
| AC-01 | Pass | Full Core regression suite and unchanged curated sample tests. |
| AC-02 | Pass | `test/lifecycle-plugin.test.ts` parses registered YAML sections into canonical extension elements. |
| AC-03 | Pass | `test/query.test.ts` verifies deterministic typed traversal across lifecycle and architecture endpoints. |
| AC-04 | Pass | `requirement_without_acceptance` targets the responsible Requirement ID. |
| AC-05 | Pass | `acceptance_without_test` targets the responsible Acceptance Criterion ID. |
| AC-06 | Pass | `test_without_evidence` targets each required Test ID. |
| AC-07 | Pass | `test/lifecycle-views.test.ts` verifies hierarchy, status, priority, owner, meaningful acceptance statements, human-readable relation labels, wrapped titles, and architecture allocation. |
| AC-08 | Pass | Quality view verifies Requirement/Criterion/Test/Evidence links, result, freshness, and an explicit explanation of how to read the projection. |
| AC-09 | Pass | Overview, Requirements, and Quality render independently from one parsed model. |
| AC-10 | Pass | `serializeLifecycle()` produces deterministic JSON. |
| AC-11 | Pass | Explicit IDs and deterministic generated relation IDs survive repeated parse and serialization. |
| AC-12 | Pass | Structural and traceability diagnostics include `target.id`. |

## Demo coverage

The root playground and `examples/demo.html` install `@archmap/lifecycle` and
add Requirements, Traceability, and Quality to the shared diagram-tags toolbar.
Three sample selector entries contain lifecycle slices:

- Checkout release slice
- CI/CD supply chain
- Incident response workflow

The checkout slice contains four independent lifecycle chains (sign-in, order
persistence, payment, and observability). Together they allocate the primary
Topology nodes without implying that one requirement proves the entire system.
Traceability excludes architecture nodes that are not connected to the selected
lifecycle path.

## Verification gate

Release evidence is refreshed for each task using:

```bash
npm run typecheck
npm test
npm run build
node /Users/mn/codex/.cache/aof-v6.5.0/src/cli.js organization-verify --project .
```
