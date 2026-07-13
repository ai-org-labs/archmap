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

The initial package registers lifecycle schema names, typed relations,
validation and view extension points. YAML parsing and complete lifecycle view
behavior are delivered by the subsequent v0.4 implementation stages.
