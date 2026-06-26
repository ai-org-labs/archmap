/**
 * Label inference (§22).
 *
 * Inference never overwrites explicit metadata. Any field it fills is recorded
 * in the element's `inferred` list so the value is visible to the user.
 */

import type { ArchEdge } from "../types.js";

interface ProtocolRule {
  test: RegExp;
  protocol: string;
}

const PROTOCOL_RULES: ProtocolRule[] = [
  { test: /https/i, protocol: "HTTPS" },
  { test: /\bhttp\b/i, protocol: "HTTP" },
  { test: /\bsql\b/i, protocol: "SQL" },
];

interface FlowRule {
  test: RegExp;
  flow: string;
}

const FLOW_RULES: FlowRule[] = [
  { test: /pub\/?sub/i, flow: "event_publish" },
  { test: /\bsqs\b/i, flow: "message_send" },
  { test: /replication/i, flow: "replication" },
  { test: /\bsync\b/i, flow: "sync" },
  { test: /\bmetrics?\b|metric export/i, flow: "monitoring" },
  { test: /\blogs?\b|logging/i, flow: "logging" },
  { test: /\bscans?\b|security scan/i, flow: "security_scan" },
];

/** Mutate an edge in place, filling fields inferable from its label. */
export function applyEdgeInference(edge: ArchEdge): void {
  const label = edge.label;
  if (!label) return;
  const inferred = edge.inferred ?? [];

  if (edge.protocol === undefined) {
    // First matching rule wins (HTTPS before HTTP).
    const rule = PROTOCOL_RULES.find((r) => r.test.test(label));
    if (rule) {
      edge.protocol = rule.protocol;
      inferred.push("protocol");
    }
  }

  if (edge.flow === undefined) {
    const rule = FLOW_RULES.find((r) => r.test.test(label));
    if (rule) {
      edge.flow = rule.flow;
      inferred.push("flow");
    }
  }

  if (/jwt/i.test(label)) {
    const auth = edge.auth ?? {};
    if (auth.token === undefined) {
      auth.token = "JWT";
      auth.inferred = [...(auth.inferred ?? []), "token"];
      edge.auth = auth;
      inferred.push("auth.token");
    }
  }

  if (/oauth/i.test(label)) {
    const auth = edge.auth ?? {};
    if (auth.method === undefined) {
      auth.method = "oauth";
      auth.inferred = [...(auth.inferred ?? []), "method"];
      edge.auth = auth;
      inferred.push("auth.method");
    }
  }

  if (/vpn/i.test(label)) {
    if (edge.networkPath === undefined) {
      edge.networkPath = ["vpn"];
      inferred.push("networkPath");
    }
    if (edge.boundaryCrossing === undefined) {
      edge.boundaryCrossing = { crosses: [], reviewed: false };
      inferred.push("boundaryCrossing");
    }
  }

  if (inferred.length > 0) edge.inferred = inferred;
}
