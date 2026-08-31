# Compatibility and Migration to ArchMap Next

Status: Approved migration direction

## 1. Migration policy

ArchMap Next does not require existing documents to be rewritten immediately.
The parser continues accepting released syntax and normalizes it into the Next
canonical topology through an explicit compatibility adapter.

The adapter is observable: migrated meanings and ambiguous legacy assertions
produce provenance and diagnostics rather than silently changing semantics.

## 2. Legacy-to-Next mapping

| Existing surface | Next canonical meaning |
| --- | --- |
| `nodes` | Resources; the public DSL name can remain `nodes` during migration |
| `nodes.*.zone` / resolved nested zone | direct Container parent |
| `zones` | Container Boundaries |
| `boundaries` | Overlay Boundaries by default |
| `subgraph` | authoring/grouping hierarchy only; no ownership or crossing semantics |
| `layer` | view/layout partition only; no ownership or crossing semantics |
| `edges` | Resource-to-Resource direct communication candidates |
| `boundaryCrossing` | legacy assertion/hint checked against derived crossings |

Existing zone visual behavior is not itself proof of valid containment. Next
normalization must establish one structural parent and reject cycles before
analysis.

## 3. Legacy boundary ambiguity

Existing `boundaries` may contain zones and nodes and were historically drawn
as logical areas. They normalize to explicit Overlay membership. Container
membership listed inside an Overlay remains explicit container membership and
does not recursively include descendants unless a future selector says so.

A later syntax version may introduce first-class `containers` and `overlays`
sections. Until then, parser compatibility and canonical model terminology are
allowed to differ.

## 4. Manual boundary crossing

`boundaryCrossing` remains accepted as legacy input for compatibility, but it
is not canonical truth.

Normalization behavior:

1. derive crossings from endpoint Container ancestry;
2. compare the legacy assertion with the derived sequence;
3. emit a diagnostic on disagreement;
4. expose the derived sequence to query, View, and renderer APIs.

Legacy boolean `boundaryCrossing: true` only means that the author expected at
least one crossing. It does not identify which boundary or role.

## 5. Collapse and abstraction

Current visual abstraction may aggregate connections from hidden members. In
Next, that aggregation cannot enter the canonical topology.

The default projection contract is:

- hidden Resource -> hidden incident Edge;
- no inferred shortcut Edge.

If a renderer offers an aggregate connection, it must be marked as a derived
summary with source Edge provenance and excluded from topology analysis,
crossing analysis, serialization as authored topology, and validation of real
communication.

## 6. Public API compatibility

Existing top-level `parse`, `render`, `computeLayout`, registered views,
custom element usage, icons, and 3D opt-in remain supported while the new
analysis APIs are added.

Recommended additive API direction:

```ts
const model = archmap.parse(source);
const topology = archmap.normalizeTopology(model);
const analysis = archmap.analyzeTopology(topology);

analysis.crossingsForEdge(edgeId);
analysis.overlayTransitionForEdge(edgeId);
archmap.project(topology, analysis, view);
```

The exact names can change during the API design task, but the separation of
parsed compatibility model, canonical topology, derived analysis, and View
projection is required.

## 7. Versioning and rollout

Rollout order:

1. publish the canonical TypeScript model and deterministic analysis fixtures;
2. add compatibility normalization without changing existing rendering;
3. compare manual crossing assertions against derived results;
4. expose analysis query APIs;
5. add purpose-specific crossing projections;
6. migrate Overview/Topology rendering to consume canonical projection;
7. consider new `containers`/`overlays` authoring syntax only after round-trip
   and migration evidence is stable.

No released syntax is removed in the first Next release.

