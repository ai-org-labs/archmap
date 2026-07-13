# @archmap/lifecycle

Requirements and lifecycle semantic graph vocabulary for ArchMap.

```ts
import { createArchMap } from "@archmap/core";
import lifecycle from "@archmap/lifecycle";

const archmap = createArchMap().use(lifecycle);
```

For the backward-compatible default ArchMap instance:

```ts
import { installLifecycle } from "@archmap/lifecycle";

installLifecycle();
```

The plugin registers lifecycle YAML sections, typed relations, validation, and
three canonical projections: `requirements`, `traceability`, and `quality`.

Hosts that use ArchMap's diagram-tags toolbar can append the plugin entries:

```ts
import { DEFAULT_DIAGRAM_TAG_VIEWS, createDiagramTags } from "@archmap/core";
import { LIFECYCLE_DIAGRAM_TAG_VIEWS } from "@archmap/lifecycle";

createDiagramTags({
  target,
  views: [...DEFAULT_DIAGRAM_TAG_VIEWS, ...LIFECYCLE_DIAGRAM_TAG_VIEWS],
});
```

The built-in demo follows this pattern. Its Checkout, CI/CD supply-chain, and
Incident-response samples contain small Requirement -> Acceptance Criterion ->
Architecture -> Test -> Evidence slices.
