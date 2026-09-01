# ArchMap Next Native Topology QIF Check

Date: 2026-09-01
Task: TASK-127
Result: PASS

## Completion criteria

- PASS: `topology:` is a first-class Core metadata section and `parse()` preserves its authored Resources, Container Boundaries, Overlay Boundaries, and direct Edges on `ArchMapModel.topology`.
- PASS: released 2D renderers receive a deterministic compatibility projection without becoming the semantic source of truth.
- PASS: Container ancestry, Resource-only endpoints, Overlay membership, bidirectional communication, Crossings, and Overlay Transitions are analyzed from the native topology.
- PASS: authored `analysis`, `crossings`, and `overlayTransitions` are rejected because they are derived output.
- PASS: legacy documents remain valid and continue through the existing parser/render pipeline.

## Quality invariants

- Resource is the only communication endpoint.
- Edge represents direct Resource-to-Resource communication; Container or Overlay endpoints are invalid.
- Container membership is a forest and carries structural ancestry.
- Overlay membership is explicit set membership and may overlap.
- Crossings and Overlay Transitions are derived from authored facts and are never accepted as authored truth.
- Canonicalization preserves native topology facts.
- Provider correctness remains a validator concern; Core retains provider-specific `kind` values without judging their hierarchy.
- Compatibility zones, boundaries, nodes, and edges are renderer bridges only. Native analysis never reads facts back from that projection.

## Evidence

- `src/topology-parser.ts`
- `src/topology-analysis.ts`
- `src/topology-forest.ts`
- `src/topology-projection.ts`
- `src/topology-validator.ts`
- `test/topology-parser.test.ts`
- `examples/next-boundary-analysis.archmap`
- `docs/SYNTAX.md`
- `docs/AI_AUTHORING_GUIDE.md`
- `docs/specs/next/12-system-topology-boundary-model.md`
- Focused topology suite: 6 files, 34 tests passed.
- Full regression suite after the final native-warning assertions: 31 files, 332 tests passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Browser smoke at `http://127.0.0.1:5173/`: 5 Resources, 6 Containers, 1 Overlay, 4 Edges, 0 errors, 0 warnings.

## QIF intent and loss boundary

- Quality intent: ArchMap Next authoring describes topology facts once, while boundary effects are deterministic analysis output.
- Protected boundary: compatibility projection may omit native roles and notes from legacy visuals, but those facts remain intact on `model.topology` and in analysis APIs.
- Deliberate compatibility behavior: provider-specific Container/Overlay kinds are not sent through legacy vocabulary validation, and native Edges do not receive the legacy `boundaryCrossing` authoring warning.
- Loss avoided: no Crossing is inferred from rendered coordinates, no hidden Resource is bypassed by a synthetic Edge, and no authored derived result can override analysis.

## Residual scope

- Existing 2D rendering uses the compatibility projection; a future native renderer may expose richer role/crossing visuals without changing the DSL or canonical model.
- Cloud-specific containment and enforced-path rules remain installable validator work.
