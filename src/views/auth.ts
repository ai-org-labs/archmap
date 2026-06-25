/**
 * Auth View (§24.3): emphasizes identity providers, auth services, users,
 * token issue/validate edges, token-carrying edges, and the nodes that issue
 * or validate tokens. Everything else is faded.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";

const AUTH_KINDS = new Set([
  "identity_provider", "oauth_provider", "auth_service",
  "user", "external_user", "service_account",
]);
const AUTH_FLOWS = new Set(["auth", "token_issue", "token_validate"]);

export function authView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const nodeIds = new Set(model.nodes.map((n) => n.id));

  const nodes = new Set<string>();
  const edges = new Set<string>();

  for (const n of model.nodes) {
    if (n.kind && AUTH_KINDS.has(n.kind)) nodes.add(n.id);
  }

  for (const e of model.edges) {
    const carriesToken = !!e.auth?.token || !!e.auth?.method;
    const authFlow = e.flow ? AUTH_FLOWS.has(e.flow) : false;
    if (carriesToken || authFlow) {
      edges.add(e.id);
      // Keep the path coherent: endpoints + declared issuer/validator.
      nodes.add(e.from);
      nodes.add(e.to);
      if (e.auth?.issuer && nodeIds.has(e.auth.issuer)) nodes.add(e.auth.issuer);
      if (e.auth?.validatedBy && nodeIds.has(e.auth.validatedBy)) nodes.add(e.auth.validatedBy);
    }
  }

  return renderDiagram({
    layout,
    viewClass: "auth",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    emphasizeNodes: nodes,
    emphasizeEdges: edges,
    nodeIcons: resolveNodeIcons(model),
  });
}
