# ArchMap Pattern Samples

This package contains six ArchMap DSL samples for validating different architecture scales and domains.

The samples follow the current ArchMap authoring shape:

- Mermaid-like `graph LR` section for visible structure.
- YAML metadata after `---` for semantic meaning.
- `nodes`, `edges`, `zones`, `boundaries`, `permissions`, `data`, `identities`, `view`, and `layout` metadata.

## Samples

| File | Pattern | Purpose |
| --- | --- | --- |
| `01-small-web-basic.archmap` | Small web system | Web frontend, server, DB, simple auth/data/permission/boundary. |
| `02-medium-auth-external-integrations.archmap` | Medium integrated system | Multiple backend APIs, auth provider, event worker, cache, DB, payment/email providers. |
| `03-large-multiregion-hybrid-ops.archmap` | Large hybrid system | Multi-region, replication, CI/CD, operations, dedicated interconnect, on-prem integration. |
| `04-android-single-app-framework-api.archmap` | Android single app | App layers, framework APIs, device resources, local DB/storage, backend API. |
| `05-android-inter-app-collaboration.archmap` | Android inter-app | Intent, deep link, content provider, bound service, Binder IPC, permission mediation. |
| `06-android-framework-driver-bt-devices.archmap` | Android framework + driver + Bluetooth | App → framework → system service → HAL → kernel driver → controller → wireless link → peer device. |

## Intended rendering checks

Use these combinations during renderer development:

```js
render(model, { baseView: "overview", overlays: ["zone", "boundary", "validation"] });
render(model, { baseView: "layer", overlays: ["zone", "auth", "dataflow", "boundary", "permission", "validation"] });
render(model, { baseView: "overview", renderMode: "3d", overlays: ["zone", "boundary", "dataflow", "permission", "validation"] });
```

The Android framework/device samples are especially useful for validating layer/zone/isometric rendering. They intentionally model non-cloud components such as Android framework APIs, Binder IPC, HAL, kernel drivers, hardware controllers, and Bluetooth links.

## Vocabulary notes

The current generic ArchMap vocabulary covers most cloud/system nodes. Android-specific samples add extension fields such as:

- `androidComponent`
- `androidLayer`
- `service`
- `role`
- `domain`

Most Android nodes keep `kind` within generic values like `mobile_app`, `runtime_service`, `database`, `iam_policy`, `network_boundary`, and `secret` to avoid excessive validator noise.

Recommended future Android vocabulary additions are listed in `android-vocabulary-extension.md`.

## Design principle represented by these samples

Edges should target concrete nodes. Zones and visual containers can be collapsed by the renderer, but the source model should retain concrete endpoints for validation, auth, dataflow, permissions, and diagnostics.
