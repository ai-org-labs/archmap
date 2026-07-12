# Zone and Subgraph Authoring QIF Check - 2026-07-13

## Quality intent

Give AI authors an unambiguous decision rule for choosing exclusive placement regions (`zone`) versus intersecting structural groups (`subgraph`).

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Runtime semantics | Pass | Topology placement rejects sibling zone intersection; subgraph geometry has no intersection constraint |
| Nesting nuance | Pass | Guide explicitly permits parent-child zone overlap by containment |
| AI decision rule | Pass | Guide asks whether overlap would create placement or ownership ambiguity |
| Discoverability | Pass | README links the guide and npm package files include it |
| Combined use | Pass | Guide describes subgraphs spanning components across exclusive zones |

## Decision

Use zones for architectural boundaries where overlap would imply conflicting placement or ownership. Use subgraphs for non-exclusive structural groupings. Sibling zones are non-intersecting; nested zones are intentionally contained; subgraphs may intersect.
