# Third-Party Notices

ArchMap is licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).

This file summarizes third-party software and icon sources that may be relevant
when publishing or redistributing ArchMap packages.

## Runtime Dependencies

| Package | License | Notes |
|---|---|---|
| `js-yaml` | MIT | YAML parser used by the ArchMap parser. |
| `argparse` | Python-2.0 | Transitive dependency of `js-yaml`. |

## Optional / Peer Dependencies

| Package | License | Notes |
|---|---|---|
| `three` | MIT | Optional peer dependency used only when consumers import and install `archmap/views3d/three-view`. |
| `@archmap/icons` | MIT | Optional icon pack used by examples and consumers that opt in to third-party icons. |
| `simple-icons` | CC0-1.0 | Used by the bundled sample `archmap/packs/cloud-icons` source for CC0 icon paths and by `@archmap/icons`. |

## Bundled Sample Icons

The core `archmap` entry point ships no vendor icon assets.

The optional `archmap/packs/cloud-icons` sample bundle includes a small number
of icon definitions:

- Google Cloud, Datadog, and Firebase paths sourced from `simple-icons`
  (`CC0-1.0`).
- AWS, Azure, and Wiz are represented by generic letter badges, not official
  vendor logos.

Consumers who register custom icons or use `@archmap/icons` are responsible for
ensuring their use of third-party logos, service marks, and trademarks complies
with the relevant owners' terms.

## Trademarks

Company names, product names, service names, and logos referenced by ArchMap
examples, icon keys, sample diagrams, or optional icon packs may be trademarks
or registered trademarks of their respective owners. Their mention does not
imply endorsement, sponsorship, or affiliation.
