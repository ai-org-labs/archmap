# v0.4 Requirements Branch Map QIF Check

Date: 2026-07-14  
Result: PASS

## Need and intent

The Requirements View must explain one requirement at a time as a readable path from requirement, through acceptance conditions, to implementing architecture. A global three-column graph created shared buses, unrelated crossings, label collisions, and no clear reading order.

## Loss boundary

- Requirement branches must remain visually independent.
- Cards and relation labels must not overlap.
- Connectors must not route through unrelated cards or branches.
- Connectors must leave and enter card sides orthogonally.
- Explicit lifecycle and architecture IDs must survive projection and rendering.

## Implementation evidence

- Requirements are projected as requirement-rooted branch groups.
- Acceptance criteria and architecture references are stacked from measured card heights.
- Each branch uses local source and target ports with an orthogonal adjacent-column router.
- Render occurrence IDs remain internal while `data-id` and displayed IDs retain canonical model IDs.
- Human-readable relation labels use separated label backgrounds.

## Verification

- Targeted lifecycle view tests: 8 passed.
- Full test suite: 21 files, 271 tests passed.
- TypeScript typecheck: passed.
- Core, extras, and lifecycle production builds: passed.
- Browser smoke at `http://127.0.0.1:5173/`: independent branches, no card overlap, and no global shared relation buses observed.

## Residual risk

Large unfiltered requirement sets remain vertically tall when fit as one map. Filtering or per-requirement collapse can improve overview scale later; it is not a correctness blocker for the branch-map projection.
