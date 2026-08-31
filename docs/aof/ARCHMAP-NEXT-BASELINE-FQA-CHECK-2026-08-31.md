# ArchMap Next Baseline FQA Check

Date: 2026-08-31  
Scope: System Topology and Boundary Visualization requirements baseline

## First question

Given nested containers, overlapping overlays, hidden boundaries, and a
bidirectional edge, can the model deterministically produce an ordered
crossing/transition trace without consulting layout geometry or inventing
communication edges?

Result: **Yes, after baseline clarification.**

The baseline now fixes ancestor ordering, exit/enter ordering, bidirectional
inversion, explicit Overlay membership, and the rule that View projection
cannot synthesize canonical Edges.

## Findings and dispositions

| Finding | Risk | Disposition |
| --- | --- | --- |
| Existing `zone`, `boundary`, `subgraph`, and `layer` meanings overlap | Crossing analysis could depend on presentation concepts | Fixed mapping: zone=Container, boundary=Overlay, subgraph=authoring group, layer=view partition |
| Existing `boundaryCrossing` is authored | Author assertion could override topology truth | Retain as compatibility hint; derived crossing is authoritative |
| Existing collapse can aggregate edges | A View could invent communication | Canonical shortcut forbidden; optional render summary must carry provenance and remain noncanonical |
| Container nonintersection was stated as model semantics | Semantic model has no coordinates | Forest enforced semantically; containment/nonoverlap enforced as renderer acceptance |
| Overlay container membership could imply descendants | Transition result would be ambiguous | Membership is explicit; recursive selectors deferred |
| Bidirectional edge crossing order was unspecified | Query results could be nondeterministic | Reverse traversal is exact inverse of forward traversal |
| `parent: null` could be interpreted as external | External-facing queries would produce false positives | External classification must be explicit |
| `enforcedBy` could imply invisible path traversal | Core could become a network simulator | Core stores relation only; path consistency belongs to validator with explicit path context |

## Loss check

The baseline preserves:

- existing cloud icon packs and provider-specific kinds;
- existing browser-only parser/render use;
- existing views while canonical analysis is introduced additively;
- lifecycle and runtime plugins as separate projections over authored facts;
- plugin ownership for cloud/security correctness.

The baseline intentionally rejects:

- Boundary endpoints;
- inferred direct communication that skips intermediate Resources;
- geometry-derived semantic crossing;
- silent recursive Overlay membership;
- View-created canonical shortcut Edges.

## Implementation gate

Do not start Crossing-focused UI work until these proof fixtures pass:

1. forest ancestry and cycle rejection;
2. ordered crossing derivation across different roots;
3. Overlay gained/lost/shared derivation;
4. bidirectional inverse trace;
5. projection with hidden Resources creates no shortcut;
6. analysis invariant under geometry changes.

## Baseline decision

The requirements are coherent enough to implement as a new architecture-core
slice. The baseline is approved with the compatibility adapter as a mandatory
part of the work, not an optional cleanup.

