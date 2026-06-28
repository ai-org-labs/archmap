# ArchMap DSL v0.1 Specification

Status: Draft
Version: 0.1.0
Purpose: Browser-only semantic architecture diagram rendering framework

---

## 1. Overview

ArchMap DSL is a Mermaid-like architecture description format for rendering
semantic architecture diagrams in the browser. ArchMap is not intended to be a
full Mermaid-compatible renderer. It defines a small graph syntax and an
architecture metadata section that can be transformed into multiple views.

Supported views in v0.1:

- Overview View
- Zone View
- Data Flow View
- Auth View
- Boundary View
- Validation View

Future views: Permission View, Layer Stack View, 3D View, GUI Canvas View.

---

## 2. Design Goals

1. Be readable as plain text.
2. Be embeddable in Markdown.
3. Be renderable entirely in the browser.
4. Support Mermaid-like graph notation for basic architecture diagrams.
5. Support semantic metadata for nodes, edges, zones, boundaries, auth,
   permissions, and data flows.
6. Generate multiple architecture views from the same model.
7. Allow later GUI editing and export back to DSL.
8. Avoid full Mermaid compatibility in v0.1.

---

## 3. Non-Goals

v0.1 does not aim to support full Mermaid / C4 / ArchiMate compatibility,
automatic cloud import, accurate cloud validation, full IAM/OAuth/OIDC
modeling, production 3D rendering, collaborative editing, or server-side
rendering.

---

> This file is an abridged in-repo reference. The authoritative source for
> §4–§31 is the full project brief; the in-code section references
> (e.g. `// §22`) point back to those section numbers.
>
> Key sections implemented in Stage 1:
> - §4 File format / section split
> - §5 Markdown embedding
> - §6, §26 Graph parser scope
> - §7–§21 Metadata model
> - §22 Inference rules
> - §23 Validation rules
> - §28 Internal model shape

See the README for current pipeline status against the §31 acceptance criteria.
