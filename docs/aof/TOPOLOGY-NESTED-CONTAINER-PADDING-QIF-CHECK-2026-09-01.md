# Topology Nested Container Padding QIF Check

Date: 2026-09-01

## Need

Nested Container Boundaries must preserve a readable hierarchy. A parent label must not touch a child boundary, and child content must not visually consume the parent container's full area.

## Acceptance Criteria

1. A parent Container keeps at least 32 layout units above each direct child for its label band.
2. A parent Container keeps at least 20 layout units on the left, right, and bottom of each direct child.
3. Sibling Containers retain the existing 24-unit non-overlap clearance.
4. Expanded nested geometry remains inside the rendered canvas while the canvas keeps its golden-ratio contract.
5. The rule is derived from containment depth and does not introduce sample-specific coordinates.

## Evidence

- `test/topology.test.ts` verifies `Production Cloud -> Production VPC -> Public/Application/Data Subnet` hierarchy spacing.
- Focused topology regression: 18 tests passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Browser smoke at `http://127.0.0.1:5173/` confirmed separate label bands and visible parent-child padding for Production Cloud, Production VPC, and each Subnet.

## Decision

PASS. Nested topology Containers now communicate containment through deterministic hierarchy-aware padding without weakening sibling separation.
