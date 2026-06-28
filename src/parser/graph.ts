/**
 * Parser for the graph section (§6, §26).
 *
 * Supports: `graph LR|TD`, the four node shapes, plain and labelled edges,
 * and simple `subgraph ... end` grouping. Subgraphs are authoring-only model
 * hierarchy and do not create rendered geometry by themselves.
 */

import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, Direction, NodeShape } from "../types.js";

export interface RawGraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Whether a shape/label was explicitly written (a definition vs. a bare reference). */
  defined: boolean;
}

export interface RawGraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface RawSubgraph {
  id: string;
  label?: string;
  members: string[];
  parent?: string;
}

export interface GraphParseResult {
  direction: Direction;
  nodes: Map<string, RawGraphNode>;
  edges: RawGraphEdge[];
  subgraphs: RawSubgraph[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Strip `%% ...` comments and trailing whitespace. */
function stripComment(line: string): string {
  const idx = line.indexOf("%%");
  return (idx === -1 ? line : line.slice(0, idx)).trim();
}

/**
 * Parse a single node token like `Web[Web App]`, `DB[(Cloud SQL)]`,
 * `User((User))`, `Decision{Is Authenticated?}`, or a bare `API`.
 * Returns null if the token is not a valid node reference.
 */
function parseNodeToken(
  token: string,
): { id: string; label?: string; shape?: NodeShape } | null {
  const t = token.trim();
  const idMatch = /^([A-Za-z][A-Za-z0-9_-]*)/.exec(t);
  if (!idMatch) return null;
  const id = idMatch[1];
  const rest = t.slice(id.length).trim();

  if (rest === "") return { id };

  // Order matters: the database form `[(...)]` must be tested before `[...]`,
  // and the circle form `((...))` before any single-paren handling.
  let m: RegExpExecArray | null;
  if ((m = /^\[\((.*)\)\]$/.exec(rest))) return { id, label: m[1], shape: "database" };
  if ((m = /^\(\((.*)\)\)$/.exec(rest))) return { id, label: m[1], shape: "circle" };
  if ((m = /^\[(.*)\]$/.exec(rest))) return { id, label: m[1], shape: "rectangle" };
  if ((m = /^\{(.*)\}$/.exec(rest))) return { id, label: m[1], shape: "diamond" };

  return null;
}

export function parseGraph(graphSource: string): GraphParseResult {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const nodes = new Map<string, RawGraphNode>();
  const edges: RawGraphEdge[] = [];
  const subgraphs: RawSubgraph[] = [];
  const subgraphStack: RawSubgraph[] = [];

  let direction: Direction = "LR";
  let sawDirective = false;

  const registerNode = (
    parsed: { id: string; label?: string; shape?: NodeShape },
  ): boolean => {
    const { id, label, shape } = parsed;
    if (!NODE_ID.test(id)) {
      errors.push(diagnostic("invalid_node_id", `Invalid node id "${id}".`, { type: "node", id }));
      return false;
    }
    const isDefinition = shape !== undefined;
    const existing = nodes.get(id);
    if (existing) {
      if (isDefinition) {
        if (existing.defined) {
          errors.push(diagnostic("duplicate_node", `Duplicate definition of node "${id}".`, { type: "node", id }));
        } else {
          // Fill a previously bare reference with its definition.
          existing.label = label ?? id;
          existing.shape = shape!;
          existing.defined = true;
        }
      }
    } else {
      nodes.set(id, { id, label: label ?? id, shape: shape ?? "rectangle", defined: isDefinition });
    }
    // Track subgraph membership.
    const sg = subgraphStack[subgraphStack.length - 1];
    if (sg && !sg.members.includes(id)) sg.members.push(id);
    return true;
  };

  const lines = graphSource.split(/\r?\n/);
  for (const raw of lines) {
    const line = stripComment(raw);
    if (line === "") continue;

    // graph LR | graph TD
    const dirMatch = /^(?:graph|flowchart)\s+(LR|TD|TB)\s*$/i.exec(line);
    if (dirMatch) {
      const d = dirMatch[1].toUpperCase();
      direction = d === "LR" ? "LR" : "TD"; // TB treated as TD
      sawDirective = true;
      continue;
    }

    // subgraph <id> [optional "label"]  /  end
    const sgMatch = /^subgraph\s+(.+)$/i.exec(line);
    if (sgMatch) {
      const spec = sgMatch[1].trim();
      const idm = /^([A-Za-z][A-Za-z0-9_-]*)(?:\s*\[(.*)\])?$/.exec(spec);
      const parent = subgraphStack[subgraphStack.length - 1]?.id;
      const sg: RawSubgraph = idm
        ? { id: idm[1], label: idm[2], members: [], ...(parent ? { parent } : {}) }
        : { id: spec, label: spec, members: [], ...(parent ? { parent } : {}) };
      subgraphs.push(sg);
      subgraphStack.push(sg);
      continue;
    }
    if (/^end$/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // Edge: LHS -->|Label| RHS  or  LHS --> RHS
    const edgeMatch = /^(.+?)\s*-->\s*(?:\|([^|]*)\|\s*)?(.+?)\s*$/.exec(line);
    if (edgeMatch) {
      const lhs = parseNodeToken(edgeMatch[1]);
      const rhs = parseNodeToken(edgeMatch[3]);
      const label = edgeMatch[2]?.trim();
      if (!lhs || !rhs) {
        warnings.push(diagnostic("unparsed_line", `Could not parse edge line: "${line}".`));
        continue;
      }
      const okFrom = registerNode(lhs);
      const okTo = registerNode(rhs);
      if (okFrom && okTo) {
        edges.push({ from: lhs.id, to: rhs.id, label: label || undefined });
      }
      continue;
    }

    // Standalone node definition / reference.
    const node = parseNodeToken(line);
    if (node) {
      registerNode(node);
      continue;
    }

    warnings.push(diagnostic("unparsed_line", `Ignored unrecognized line: "${line}".`));
  }

  if (!sawDirective) {
    warnings.push(diagnostic("missing_direction", "No `graph LR|TD` directive found; defaulting to LR."));
  }

  return { direction, nodes, edges, subgraphs, errors, warnings };
}
