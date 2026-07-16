# v0.5 Layer Background QIF Check

Date: 2026-07-17
Result: PASS

## Need and intent

Layer swimlanes need author-controlled backgrounds for business-flow diagrams.
Authors must be able to retain the theme palette, use one solid color, remove
all fills, or alternate colored and unfilled lanes without fixed coordinates.

## Loss boundary

- Background configuration must not change layer membership or lane geometry.
- Existing documents must retain the built-in Layer palette.
- Transparent lanes must retain their border and label.
- Unsafe CSS values must not be emitted into SVG style attributes.
- LR horizontal lanes and TD/TB vertical lanes must use the same configuration.

## Implementation evidence

- `view.layer.background.mode` supports `default`, `solid`, `alternate`, and `none`.
- `color` supplies the solid fill and `colors` supplies even/odd alternating fills.
- `transparent` supports the requested color/no-color alternation.
- Layer fill variables override depth palette values without changing borders.
- Color values are allowlisted before entering generated SVG.

## Verification

- Targeted render tests: 62 passed.
- TypeScript typecheck: passed.
- Core, extras, and lifecycle production builds: passed.

## Residual risk

Named CSS colors, hexadecimal colors, and numeric rgb/rgba/hsl/hsla colors are
supported. CSS variables, gradients, and URL-based paints are intentionally not
accepted because DSL source is untrusted text.
