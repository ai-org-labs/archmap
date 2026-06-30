# 05. ScreenFlow and Prototype View

This document extends ArchMap v0.1 with ScreenFlow authoring and the
`prototype` base view. It does not introduce a separate engine; it extends
`@archmap/core`.

## 1. Scope

ScreenFlow models screen transitions, paper-prototype playback, and
hotspot-driven navigation.

In scope:

- screen-like nodes
- transition edges
- scenario playback
- image-backed or fallback-card screens
- hotspot click regions
- overlay summaries for dataflow, auth, boundary, permission, and validation

Out of scope:

- Figma import
- hotspot GUI editing
- screenshot OCR
- full animation engine
- native device-frame fidelity
- 3D prototype playback

## 2. Profile

ScreenFlow is enabled with:

```yaml
mode: screenflow
```

or:

```yaml
profile: screenflow
```

Compatibility parsers may also treat `architecture: screenflow` as equivalent
to `profile: screenflow`.

## 3. Node Metadata

Screen-like nodes may define:

```yaml
nodes:
  Home:
    kind: screen
    image: ./screens/home.svg
    frame:
      device: mobile
      width: 390
      height: 844
```

Fields:

- `image`: screen capture, wireframe, or mock image URL.
- `frame.device`: optional presentation label.
- `frame.width` / `frame.height`: image-space size used to scale and validate
  hotspots.

Standard ScreenFlow node kinds:

```text
screen page tab modal dialog drawer form webview external_page auth_guard
error_screen completion_screen activity decision start end
```

## 4. Edge Metadata

Transition edges may define:

```yaml
edges:
  Home->ProductDetail:
    flow: navigate
    trigger: tap
    hotspot: { x: 80, y: 220, width: 240, height: 160 }
    transition: { type: fade, duration: 200 }
```

Fields:

- `trigger`: user/system transition trigger.
- `hotspot`: clickable image-space rectangle on the source screen.
- `transition`: retained transition metadata.

Standard ScreenFlow flows:

```text
navigate submit back redirect deep_link open_modal close_modal switch_tab
auth_check api_call success error auto
```

## 5. Scenarios

Scenarios define playback order:

```yaml
scenarios:
  happy_path:
    label: Purchase happy path
    start: Home
    steps:
      - Home->ProductDetail
      - ProductDetail->Cart
```

`steps` may reference explicit edge ids or pair keys. If a pair key matches
multiple edges, diagnostics must ask for an explicit id.

## 6. Prototype View

`prototype` is a base view:

```ts
render(model, {
  baseView: "prototype",
  scenario: "happy_path",
  showHotspots: true,
  overlays: ["dataflow", "boundary", "validation"],
  target: element,
});
```

Initial screen resolution order:

1. render option `scenario`
2. metadata default prototype scenario
3. first scenario start
4. first screen node with no incoming edge
5. first screen node
6. first node

The view must show:

- current screen image or fallback card
- outgoing transition buttons
- Back / Next / Reset controls
- scenario selector
- hotspot visibility toggle
- overlay summary
- related validation diagnostics

## 7. Overlays

Prototype View uses the existing overlay names:

- `dataflow`: data objects on outgoing transitions.
- `auth`: auth metadata on outgoing transitions.
- `boundary`: boundary-crossing transitions.
- `permission`: permissions related to the current screen.
- `validation`: diagnostics related to the current screen, outgoing edges, or
  selected scenario.

## 8. Diagnostics

Additional diagnostics:

| Code | Level | Condition |
| --- | --- | --- |
| `screen_node_without_image` | suggestion | Screen-like node has no `image`. |
| `transition_without_trigger` | suggestion | ScreenFlow transition has no `trigger`. |
| `hotspot_out_of_bounds` | warning | Hotspot exceeds source `frame` bounds. |
| `scenario_unknown_start` | error | Scenario start node does not exist. |
| `scenario_unknown_step` | error | Scenario step cannot resolve to an edge. |
| `unreachable_screen` | suggestion | Screen has no incoming transition and is not a scenario start. |
| `ambiguous_transition` | suggestion | No scenario is defined and a screen has multiple outgoing transitions. |
| `external_transition_without_boundary` | warning | Transition to external screen/zone lacks `boundaryCrossing`. |
| `image_url_disallowed` | error | Image URL uses an unsafe protocol. |

## 9. Security

ScreenFlow follows the ArchMap untrusted-source policy:

- DSL text never executes.
- Labels, descriptions, diagnostics, and ids are escaped.
- Image URLs are assigned to DOM attributes, not interpolated into HTML.
- Unsafe protocols such as `javascript:` and `data:` are rejected.
- External images load under normal browser CORS and network policy.
