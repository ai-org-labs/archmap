# Plugin Architecture and Package Boundaries

Status: Approved v0.4 architecture direction

## 1. Decision

`@archmap/core` remains a compact semantic graph engine. Domain vocabulary,
domain validation, advanced views, policies, themes, and external integrations
are installed through plugins.

The first extracted package is `@archmap/lifecycle`.

```ts
import { createArchMap } from "@archmap/core";
import lifecycle from "@archmap/lifecycle";

const archmap = createArchMap();
archmap.use(lifecycle);
const model = archmap.parse(source);
const result = archmap.render(model, { baseView: "requirements" });
```

`installLifecycle()` may be provided as a convenience wrapper for the default
singleton, but tests and embedded applications should prefer isolated
`createArchMap()` instances to prevent cross-test/global registry leakage.

## 2. Core responsibility

Core owns:

- graph/YAML parser foundations
- node, edge, zone, boundary, layer, and timeline foundations
- generic extension element and relation records
- type, relation, validator, policy, serializer, importer, exporter, overlay,
  theme, and view registries
- generic schema dispatch and unknown-plugin diagnostics
- generic query and trace traversal
- layout/render foundations and a minimum default theme
- plugin dependency/version/conflict checks
- plugin loader and instance lifecycle

Core does not deeply define Requirement, Risk, Test, Evidence, Threat, JUnit,
OpenAPI, GitHub, or industry vocabulary.

## 3. Initial packages

| Package | Initial responsibility |
| --- | --- |
| `@archmap/core` | Semantic graph, architecture vocabulary, extension/plugin APIs, generic query/trace |
| `@archmap/icons` | SVG icon assets; remains independently versioned |
| `@archmap/lifecycle` | Lifecycle schema, relations, validators, Requirements/Traceability/Quality views |
| `@archmap/quality` | Future QIF-style tests/evidence/gates/coverage/readiness and quantitative policies |
| `@archmap/connectors` | Initial workspace umbrella only; external integrations should publish separately when mature |

Initial repository layout keeps the existing root package as Core to avoid a
disruptive move:

```text
package.json                 # @archmap/core
src/                         # core
packages/
  lifecycle/                 # @archmap/lifecycle
  quality/                   # later
  connectors/                # later workspace umbrella
```

Do not move Core into `packages/core` during the v0.4 vertical slice. Revisit a
full monorepo relocation only with an explicit migration and publishing plan.

## 4. Lifecycle plugin

The first plugin bundles four inseparable surfaces:

1. Schema: Requirement, AcceptanceCriterion, Decision, Risk, Test, Evidence.
2. Relations: derives, refines, decomposes, satisfies, implemented_by,
   verified_by, evidenced_by, mitigated_by, released_in, monitored_by.
3. Validation: requirement/acceptance/traceability gap diagnostics.
4. Views: Requirements, Traceability, Quality initially; Risk,
   ChangeImpact, and ReleaseReadiness later.

Installing lifecycle makes its YAML sections parseable, relation types valid,
validators active, and views available in one operation.

Test/Evidence are included in the v0.4 lifecycle MVP to complete the vertical
slice. Their advanced evaluation, freshness, quantitative metrics, gates, and
QIF policy logic move to `@archmap/quality` without changing lifecycle IDs.

## 5. Plugin contract

```ts
export interface ArchMapPlugin {
  name: string;
  version: string;
  requires?: Record<string, string>;
  elementTypes?: ElementTypeDefinition[];
  relationTypes?: RelationTypeDefinition[];
  validators?: ValidatorDefinition[];
  views?: ViewDefinition[];
  overlays?: OverlayDefinition[];
  policies?: PolicyDefinition[];
  serializers?: SerializerDefinition[];
  importers?: ImporterDefinition[];
  exporters?: ExporterDefinition[];
  themes?: ThemeDefinition[];
  install?(context: PluginContext): void | PluginCleanup;
}
```

Minimum v0.4 Core registration APIs:

```ts
registerElementType(definition)
registerRelationType(definition)
registerValidator(definition)
registerView(name, definition)       // existing API adapted to instance registry
```

The registry design must leave additive paths for:

```ts
registerPolicy(definition)
registerSerializer(definition)
registerImporter(definition)
registerExporter(definition)
registerOverlay(definition)
registerTheme(definition)
```

## 6. Registry requirements

- Registries are isolated per `createArchMap()` instance.
- The current top-level API remains a preconfigured default instance for
  backward compatibility.
- Registration is deterministic and idempotent for the same plugin/version.
- Conflicting names or incompatible versions produce diagnostics/errors; last
  writer does not silently win.
- Plugins may declare dependencies and compatible Core version ranges.
- Plugin installation returns cleanup/uninstall support where safe.
- Parsing, validation, query, and rendering receive an explicit registry
  context; avoid hidden mutable module globals.
- Browser ESM/CDN installation and Node ESM installation use the same semantics.
- Unknown plugin-owned YAML is preserved as inert extension data and never
  executed.

## 7. Validation and policy ownership

- Core: duplicate ID, missing internal reference, invalid registered relation,
  schema mismatch, syntactic cycles.
- Lifecycle: missing acceptance, owner/goal/allocation gaps, lifecycle status.
- Quality: missing/stale evidence, failed thresholds, gate/readiness rules.
- Security: missing auth/control/retention and domain security rules.
- Policy packs: organization/industry-specific pass conditions.

This prevents irrelevant warning floods in projects that did not install a
domain package or policy.

## 8. Future package families

- `@archmap/security`, later optional `security-stride`, `privacy`.
- `@archmap/connector-github`, `connector-openapi`, `connector-terraform`,
  `connector-kubernetes`, `connector-junit`, `connector-playwright`,
  `connector-reqif`.
- `@archmap/packs-software-delivery`, `packs-cloud`, `packs-requirements`,
  `packs-devops`, `packs-ai-governance`.
- `@archmap/policy-minimum`, `policy-production`, and industry policies.
- `@archmap/theme-default`, `theme-dark`, `theme-enterprise`, `theme-print`.

Packs are presets that install existing plugins; they must not fork canonical
element meanings. Cloud packs provide semantic vocabulary, while
`@archmap/icons` continues to provide only visual assets.

## 9. Non-goals for the first slice

- Publishing twenty fine-grained packages immediately.
- Moving the existing Core source tree.
- Implementing connectors, quality gates, security packs, policies, or themes.
- Loading arbitrary remote code from DSL source.
- Allowing a plugin to fabricate trusted Evidence or human Approval.

## 10. Acceptance

1. Current top-level `parse`, `render`, `computeLayout`, and `registerView`
   behavior remains compatible.
2. Two ArchMap instances can install different plugins without leakage.
3. Lifecycle source parses only with lifecycle installed, with a useful
   plugin-required diagnostic otherwise.
4. `installLifecycle()` registers schema, relations, validators, and views.
5. Plugin conflicts and incompatible versions are deterministic failures.
6. Browser/CDN and Node ESM installation paths are tested.
7. Core package does not import lifecycle package code.
8. A plugin can be tree-shaken/excluded when unused.
