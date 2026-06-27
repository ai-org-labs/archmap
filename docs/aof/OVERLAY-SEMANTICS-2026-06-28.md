# Overlay Semantics Check — 2026-06-28

This note fixes the intended meaning of Add info overlays before continuing
TASK-009 overlay parity work.

## Shared Rule

Base views show structure. Add info overlays add a focused semantic lens without
reparsing, changing zoom, or changing the base layout where possible.

When overlays compete for space, priority is:

1. validation
2. permission
3. auth
4. dataflow
5. boundary

## Auth

Purpose: authentication and token lifecycle.

Canvas should emphasize:

- user/client/auth-service nodes
- token issue edges
- token-carrying request edges
- token validators
- compact token badges such as JWT/cookie/access_token

Should not show principal-resource access. That belongs to Permission.

Current risk: auth currently mostly highlights edges and puts a token badge on
the edge target. It needs clearer issuer/validator/readable token lifecycle.

## Dataflow

Purpose: data objects, movement, storage, and classification.

Canvas should emphasize:

- data-carrying edges
- storage nodes
- data classifications
- storedIn and processedBy relations

Should not be a generic "all runtime traffic" overlay.

Current risk: flow-kind matching is useful, but data object identity is too
implicit on canvas. Needs compact object/classification badges and inspector
detail rather than noisy edge labels.

## Boundary

Purpose: physical/logical area crossings.

Canvas should emphasize:

- declared boundary boxes
- zone-crossing edges
- edges with `boundaryCrossing`
- boundary labels

Should not duplicate Zone. Zone shows physical grouping; Boundary shows logical
trust/network/org boundaries and crossings.

Current risk: boundary and zone both render boxes; visual styles and labels must
stay distinct, especially when both are enabled.

## Permission

Purpose: principal-to-resource access.

Canvas should emphasize:

- principals/service accounts/attached identities
- resources
- allow/deny/role/action relationships

Should not be auth token issuance or validation.

Current risk: dense diagrams collapse permissions to summaries, which is good,
but the overlay needs a clearer selected/focused path when a principal or
resource is selected.

## Validation

Purpose: authoring and review diagnostics.

Canvas should emphasize:

- diagnostic target nodes/edges/zones/boundaries
- level badges/counts
- selected diagnostic focus

Should not be mixed with semantic warnings from auth/dataflow unless those are
actual model diagnostics.

Current risk: validation uses simple ERR/WARN badges. It should eventually
carry level counts and connect better to the diagnostics list/inspector.

## Next Implementation Order

1. Keep 3D visually clean: no ground plane, no grid.
2. Split overlay badge semantics so each overlay produces distinct badge text
   and CSS class.
3. Improve auth lifecycle display: issuer → token edge → validator.
4. Improve dataflow object/classification display without adding dense labels.
5. Add validation count/level badges and selected diagnostic focus.
