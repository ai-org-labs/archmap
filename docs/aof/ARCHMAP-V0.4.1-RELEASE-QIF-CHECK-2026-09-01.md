# ArchMap v0.4.1 Release QIF Check

Date: 2026-09-01  
Scope: `@archmap/core`, `@archmap/lifecycle`, GitHub Release, GitHub Pages

## Release question

Can the current `main` branch be published as v0.4.1 without regressing the
v0.4.0 architecture/lifecycle surfaces, while making the ArchMap Next topology
slice and focused sample pages publicly inspectable?

## Quality criteria

| Criterion | Required evidence | Result |
| --- | --- | --- |
| Version consistency | Root, lockfile, lifecycle package, plugin descriptor, site badge | Pass: all report `0.4.1`; lifecycle requires Core `^0.4.1` |
| Backward compatibility | Existing parser/render/view tests | Pass: 31 files / 333 tests |
| Next semantic integrity | Topology model, forest, crossing, transition, projection tests | Pass: `npm run verify:next` and deterministic benchmark |
| Build integrity | Core, extras, lifecycle, site production builds | Pass: production build completed |
| Package integrity | Core and lifecycle dry-run package manifests | Pass: Core 95 files; Lifecycle 17 files |
| Pages integrity | Root and four focused routes with standalone assets | Pass: workflow `33489493413` and all five public routes |
| Release traceability | Release notes, tag, GitHub Release, AOF handoff | Ready: notes and final handoff tracked; tag/release follow this gate commit |

## Known constraint

The FQA compatibility review is a Conditional Pass for semantic equivalence:
legacy documents remain usable, but projects that depended on manually authored
boundary-crossing assertions should review derived Container Crossing and
Overlay Transition results during migration.

## Evidence

- `npm run verify:next`: typecheck, 333 tests, production build, and topology
  determinism benchmark passed.
- Benchmark: 120 resources analyzed in 0.82 ms and projected in 0.36 ms; 1,000
  resources analyzed in 2.15 ms and projected in 1.44 ms.
- `npm pack --dry-run --json`: `@archmap/core@0.4.1` contains 95 files
  (398,228 byte tarball; 1,388,004 bytes unpacked).
- `npm pack --workspace @archmap/lifecycle --dry-run --json`:
  `@archmap/lifecycle@0.4.1` contains 17 files (12,418 byte tarball; 48,800
  bytes unpacked).
- In-app browser smoke passed for `/`, `/playground/`, `/examples/`,
  `/prototype/`, and `/lifecycle/`; every route exposed its intended page and
  the `v0.4.1` site badge.
- GitHub Pages workflow
  [`33489493413`](https://github.com/ai-org-labs/archmap/actions/runs/33489493413)
  completed successfully, including standalone asset verification and deploy.
- Public browser smoke passed for
  [`/archmap/`](https://ai-org-labs.github.io/archmap/),
  [`/playground/`](https://ai-org-labs.github.io/archmap/playground/),
  [`/examples/`](https://ai-org-labs.github.io/archmap/examples/),
  [`/prototype/`](https://ai-org-labs.github.io/archmap/prototype/), and
  [`/lifecycle/`](https://ai-org-labs.github.io/archmap/lifecycle/).
- Residual: the site build reports a large dynamic chunk (about 3.16 MB,
  923 KB gzip). It is a performance backlog item, not a functional release
  blocker.

## Decision

Approved for v0.4.1 publication. The GitHub Pages workflow and public route
smoke check succeeded. The FQA semantic-readiness constraint remains explicitly
documented and does not regress released DSL parsing or rendering.
