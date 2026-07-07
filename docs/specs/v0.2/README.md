# ArchMap v0.2 specification set

ArchMap v0.2 is **v0.1 plus the 4D timeline**. The five v0.1 documents in
[`../v0.1/`](../v0.1/) remain normative and unchanged; v0.2 adds one document:

6. [`06-timeline-4d.md`](06-timeline-4d.md) — the `timeline:` metadata section,
   per-element `lifecycle:` declarations, presence semantics, rendering rules,
   diagnostics, and the reserved 5D (`variants:`) extension space.

Authority order: product-principles → model-validation → dsl-syntax →
views-rendering → engine-api → timeline-4d.

## Compatibility contract

- A document without `timeline:` metadata parses, validates, and renders
  exactly as in v0.1. All timeline model fields, render options, and
  `RenderResult` methods are additive.
- The `@archmap/core` package name, exports, and every v0.1 public API are
  unchanged.
