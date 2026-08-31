# ArchMap Next Release Gate

Status: Required for the first Next-capable release

## Purpose

The release gate proves that Next is additive: released documents remain
usable while canonical topology, deterministic analysis, non-synthesizing
projections, validator plugins, rendering, exports, and package delivery are
verified together.

Run:

```bash
npm run verify:next
node /Users/mn/codex/.cache/aof-v6.5.0/src/cli.js organization-verify --project .
```

## Gate coverage

`verify:next` requires:

1. TypeScript public contracts compile.
2. The complete test suite passes, including curated and pattern samples.
3. Existing Overview, Topology, Layer, Prototype, lifecycle, SVG, and PNG
   behavior remains covered by regression tests.
4. The distributable package builds, including the optional lifecycle
   workspace.
5. Canonical analysis is byte-stable across repeated runs.
6. Projection removes incident Edges when Resources are hidden and never
   synthesizes shortcut communication.
7. Crossing semantics survive hidden Container rendering.
8. Representative (120 Resources) and large (1,000 Resources) topology models
   produce measured analysis and projection evidence.

Wall-clock benchmark values are evidence, not a brittle unit-test threshold.
Regressions are evaluated against the same command, runtime, and fixture shape.
Correctness checks fail the command immediately.

### Baseline evidence

Measured on Node.js v25.5.0 with `npm run verify:next` on 2026-09-01:

| Resources | Edges | Crossings | Analyze | Repeat | Projection |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 120 | 119 | 250 | 0.86 ms | 0.56 ms | 0.36 ms |
| 1,000 | 999 | 2,098 | 2.29 ms | 1.55 ms | 1.49 ms |

Both repeated analyses produced identical serializable facts. These numbers
are a comparison baseline for the checked fixture, not a universal SLA.

## Packaging

The npm package includes this `docs/specs/next` directory so consumers can
inspect the canonical contracts and migration policy beside the shipped API.
The AI authoring guide maps released DSL terms to Resource, Container Boundary,
Overlay Boundary, Edge, Crossing, and Overlay Transition semantics.

## Release decision

The first Next release is ready only when `verify:next` and recurring AOF/QIF
verification both pass on the release commit. Publishing, tagging, and GitHub
Pages deployment remain explicit release operations; this gate does not perform
them automatically.
