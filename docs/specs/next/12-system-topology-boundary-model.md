# System Topology and Boundary Model

Status: Approved ArchMap Next requirements baseline

## 1. Product contract

ArchMap Next is an Architecture-as-Code technology specialized for system
topology and boundary visualization. Its central value is not merely arranging
cloud icons. It defines and analyzes:

1. which endpoint-capable resources exist;
2. which resources communicate directly;
3. where resources are structurally contained;
4. which semantic sets apply to each resource or container; and
5. which structural boundaries and semantic sets change along each declared
   communication.

The processing order is normative:

```text
Topology Definition
  -> Normalize
  -> Topology Analysis
  -> Crossing and Overlay Transition Analysis
  -> View Projection
  -> Layout
  -> Rendering
```

Layout geometry never changes topology analysis.

## 2. Seven principles

1. **Resource is Endpoint.** A Resource is an entity that can be a
   communication endpoint.
2. **Edge is Real Communication.** An Edge is one actual direct communication
   between two Resources.
3. **Container is Containment.** A Container Boundary represents actual,
   single-parent structural membership.
4. **Overlay is Set.** An Overlay Boundary is a freely overlapping semantic
   set.
5. **Crossing is Derived.** Authors do not declare canonical crossings;
   ArchMap derives them.
6. **Model is not View.** A View may omit facts but may not invent topology.
7. **Core describes, Validator judges.** Core owns generic structure and
   deterministic analysis. Plugins judge cloud, network, security, and
   organization-specific correctness.

## 3. Canonical model

Conceptually, the canonical model is:

```ts
interface TopologyModel {
  resources: Resource[];
  containers: ContainerBoundary[];
  overlays: OverlayBoundary[];
  edges: TopologyEdge[];
  views: TopologyView[];
  analysis: {
    crossings: Crossing[];
    overlayTransitions: OverlayTransition[];
  };
}
```

`analysis` is generated output. Parsed author input must not be trusted as
canonical derived analysis.

### 3.1 Resource

A Resource is any real endpoint-capable entity: person, client application,
gateway, service, database, queue, external SaaS, or partner system.

```ts
interface Resource {
  id: string;
  label?: string;
  kind?: string;
  parent: string | null;
  note?: string;
  extensions?: Record<string, unknown>;
}
```

`parent` references the direct Container Boundary only. Ancestors are derived.
`null` is valid and does not itself mean "external".

### 3.2 Container Boundary

A Container Boundary represents real structural containment such as a project,
VPC, subnet, account, cluster, or deployment unit. Core does not assign
cloud-specific meaning to these examples.

```ts
interface ContainerBoundary {
  id: string;
  label?: string;
  kind?: string;
  roles: string[];
  parent: string | null;
  enforcedBy?: string[];
  note?: string;
  extensions?: Record<string, unknown>;
}
```

Container membership is a forest:

- a Resource has zero or one direct structural parent;
- a Container Boundary has zero or one parent;
- parent cycles are invalid;
- multiple roots are valid;
- rendered sibling containers must not geometrically overlap;
- rendered descendants must be fully contained by their ancestor boxes.

The semantic model has no geometry, so "partial intersection" is enforced by
the renderer acceptance contract rather than inferred from authored positions.

`kind` identifies what a boundary is. `roles` identifies which analysis
perspectives it participates in, such as `network`, `security`, or
`administrative`. Roles are extensible strings registered by plugins.

`enforcedBy` associates boundary meaning with controlling Resources. It does
not assert that every crossing communication traverses those resources.
Path-consistency is a validator concern.

### 3.3 Overlay Boundary

An Overlay Boundary is an arbitrary semantic set. It can include Resources and
Container Boundaries and can overlap any other Overlay.

```ts
interface OverlayBoundary {
  id: string;
  label?: string;
  kind?: string;
  roles?: string[];
  members: Array<{ type: "resource" | "container"; id: string }>;
  render?: "outline" | "highlight" | "badge";
  note?: string;
  extensions?: Record<string, unknown>;
}
```

Membership is explicit. Referencing a Container does not silently include all
descendant Resources. A future selector can request descendant expansion, but
that expansion must be explicit and deterministic.

An Overlay is not inherently a rectangular box. The renderer selects an
appropriate visual treatment from the View and `render` hint.

### 3.4 Edge

An Edge records direct communication and always connects Resource to Resource.
Container or Overlay endpoints are invalid.

```ts
interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  direction: "directed" | "bidirectional";
  protocol?: string;
  port?: number | string;
  note?: string;
  extensions?: Record<string, unknown>;
}
```

If communication is `Client -> Load Balancer -> API`, authors must declare two
Edges. `Client -> API` is not an equivalent shorthand.

## 4. Deterministic crossing analysis

For each directed traversal of an Edge:

1. resolve the source and target ancestor chains from root to direct parent;
2. find their longest common prefix;
3. emit `exit` crossings from the source direct parent upward to, but excluding,
   the common ancestor;
4. emit `enter` crossings from below the common ancestor down to the target
   direct parent.

```ts
interface Crossing {
  id: string;
  edgeId: string;
  traversal: "forward" | "reverse";
  sequence: number;
  boundaryId: string;
  direction: "enter" | "exit";
  roles: string[];
}
```

Examples:

- same direct container: no crossing;
- nested source to uncontained target: exit every source ancestor from inner
  to outer;
- uncontained source to nested target: enter every target ancestor from outer
  to inner;
- different roots: exit the complete source chain, then enter the complete
  target chain;
- bidirectional Edge: reverse traversal is the exact direction-reversed,
  order-reversed sequence of the forward traversal.

All Container crossings are retained. Views filter by roles after analysis.

## 5. Overlay transition analysis

Overlay transitions are separate from Container crossings.

```ts
interface OverlayTransition {
  edgeId: string;
  traversal: "forward" | "reverse";
  gained: string[];
  lost: string[];
  shared: string[];
}
```

The lists are deterministic and sorted by stable Overlay ID. Reverse traversal
swaps `gained` and `lost`; `shared` remains unchanged.

## 6. Validator boundary

Core validation owns:

- duplicate and unknown IDs;
- unknown or cyclic Container parents;
- multiple structural parents after normalization;
- Edge endpoints that are not Resources;
- unknown Overlay members;
- deterministic crossing and transition invariants.

Plugin validators own:

- cloud-provider containment rules;
- network feasibility;
- security architecture rules;
- `enforcedBy` path consistency;
- organization-specific `kind` and `role` rules.

Because Edges are direct hops, Core must not claim that an Edge traverses a
Firewall that is not an endpoint. An enforcement validator needs an explicit
path/scenario context or a declared adjacent enforcement Resource.

Core exposes `registerTopologyValidator()` and the plugin field
`topologyValidators`. A topology validator receives the canonical
`TopologyModel`, its deterministic `DerivedTopologyAnalysis`, and the owning
`ArchMapInstance`. `validateTopology(topology, { paths })` can additionally
provide explicit ordered Resource paths. If `paths` is omitted, `pathContext`
is absent: Core never infers an invisible Firewall, Gateway, or other hop.

Topology diagnostics can address canonical objects directly with target types
`resource`, `container`, `overlay`, `edge`, and `crossing`. Provider packages
therefore own provider containment truth without teaching Core GCP, AWS,
Azure, or organization-specific architecture policy.

## 7. View projection

A View can filter Resources, Edges, Containers, Overlays, crossings, and
transitions. It cannot create canonical Resources or Edges.

Normative projection rules:

- hiding a Resource hides its incident Edges;
- hiding an intermediate Resource does not create a shortcut Edge;
- hiding a Container does not require hiding its crossings;
- crossing visibility and boundary visibility are independent;
- role filters apply to already-derived crossings;
- a collapsed or summarized visual connection, if ever supported, is a
  renderer-owned derived artifact and must be explicitly identified as a
  summary, never returned as a canonical Edge.

## 8. Crossing rendering

Crossing semantics do not contain coordinates. The renderer places a crossing
marker:

- at the Edge/Container outline intersection when that Container is visible;
- at a collision-free position on the Edge when the Container is hidden.

A Crossing Focus presentation should emphasize the relevant Edge, marker,
Container name, direction, and selected role while de-emphasizing unrelated
topology. It must preserve the component-safe routing rules used by Overview
and Topology views.

Overview and Topology expose this as an additive render option:

```ts
render(model, {
  baseView: "topology",
  overlays: ["zone"],
  crossingFocus: {
    roles: ["network"],
    showLabels: true,
  },
});
```

`roles`, `edgeIds`, and `boundaryIds` narrow the already-derived crossing
facts; they do not rewrite canonical Edges. `showLabels: false` keeps the
crossing markers and selection targets while hiding their compact labels.

The marker projection is computed from the final routed polyline used by the
SVG. Consequently pan, zoom, minimap, selection, SVG export, and PNG export
all observe the same geometry. Clicking a marker selects its canonical Edge;
the marker also retains its crossing, boundary, direction, and role IDs as
SVG data attributes for inspectors and integrations.

## 9. Required purpose-specific projections

The same canonical topology must support at least:

- cross-network communication;
- cross-administrative/project communication;
- cross-security-boundary communication;
- explicitly classified external-facing communication;
- Overlay transitions such as PCI scope gained/lost/shared.

`parent: null` alone is insufficient to classify a Resource as external. Use
an explicit kind, role, tag, Overlay, or validator profile.

## 10. Acceptance fixtures

The implementation is not complete until automated fixtures prove:

1. cross-project `API -> DB` produces ordered inner-to-outer exits followed by
   outer-to-inner enters;
2. same-container communication produces no crossing;
3. an uncontained source entering a nested target produces only ordered enters;
4. Overlay transitions produce stable gained/lost/shared sets;
5. bidirectional traversal is the exact inverse;
6. a Boundary used as an Edge endpoint is rejected;
7. a hidden Resource removes incident Edges and creates no shortcut;
8. hidden Container plus visible crossing remains renderable;
9. sibling Container boxes do not overlap and descendants remain contained;
10. crossing output is unchanged by node coordinates, pan, zoom, or drag.
