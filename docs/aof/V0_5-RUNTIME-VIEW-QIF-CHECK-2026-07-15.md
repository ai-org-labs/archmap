# Runtime View QIF Check — 2026-07-15

## Quality intent

ArchMap must present authored operational state with observability-grade visual
clarity while remaining a deterministic, browser-only DSL renderer. Runtime
facts must never be confused with live telemetry or invented evidence.

## Scope

- `runtime:` parsing and canonical preservation
- provenance and no-data validation
- Design / Runtime / Diff projections
- runtime canvas, inspector, timeline, minimap, filtering, grouping
- JSON / CSV / SVG / PNG export
- keyboard selection and large-model projection

## QIF decision

| Check | Result | Evidence |
| --- | --- | --- |
| DSL remains the source of truth | PASS | `docs/specs/v0.5/11-observed-topology.md`, `docs/SYNTAX.md` |
| No vendor or OTel dependency | PASS | package/dependency and source review |
| Measured/estimated/declared are distinguishable | PASS | runtime types, parser, validator, inspector |
| Unknown and no-data are not fabricated | PASS | validation and health rendering |
| View is operationally scannable | PASS | health rings, metric encoding, inspector, timeline, minimap |
| Large graphs avoid full visual expansion | PASS | deterministic grouping and 100/1000/10000 benchmark |
| Export and accessibility surface is complete | PASS | JSON/CSV/SVG/PNG plus keyboard-selectable nodes |
| Existing DSL remains compatible | PASS | full typecheck/test/build suite |
| Browser behavior is usable | PASS | Runtime switch, controls, node selection, inspector, timeline, and minimap exercised at `127.0.0.1:5173` |
| YAML timestamps are stable | PASS | Unquoted YAML dates normalize to ISO strings; regression coverage rejects false missing-time diagnostics |

## Loss boundaries

- **Blocked:** implying that authored values are live telemetry.
- **Blocked:** silently coercing missing values into healthy values.
- **Blocked:** requiring Datadog, OpenTelemetry, or a network connector.
- **Mitigated:** dense maps are projected by environment/team/region/zone before
  DOM rendering.

## Outcome

TASK-108 meets completion and success criteria as a DSL-authored Runtime View.
Connector ingestion remains explicitly outside this task and product contract.

Verification: 277 full-suite tests, typecheck, production build, browser smoke,
and generated 100/1,000/10,000-element projection benchmarks all passed.
