/**
 * Data Flow View (§24.5): emphasizes data objects' storage/processing nodes,
 * storage-kind nodes, and edges that carry data; fades the rest. Data
 * classifications are shown as node badges when declared.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";

const STORAGE_KINDS = new Set([
  "database", "relational_database", "nosql_database", "object_storage",
  "file_storage", "cache", "data_warehouse", "legacy_database",
  "queue", "topic", "event_bus",
]);
const DATA_FLOWS = new Set([
  "data_access", "data_write", "data_read", "replication", "sync",
  "event_publish", "event_subscribe", "message_send", "message_receive", "batch",
]);

export function dataflowView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const edgeById = new Map(model.edges.map((e) => [e.id, e]));

  const nodes = new Set<string>();
  const edges = new Set<string>();
  const badges = new Map<string, string>();

  for (const n of model.nodes) {
    if (n.kind && STORAGE_KINDS.has(n.kind)) nodes.add(n.id);
  }

  for (const e of model.edges) {
    if (e.flow && DATA_FLOWS.has(e.flow)) {
      edges.add(e.id);
      nodes.add(e.from);
      nodes.add(e.to);
    }
  }

  for (const d of model.data) {
    for (const id of d.storedIn ?? []) {
      nodes.add(id);
      if (d.classification) badges.set(id, d.classification);
    }
    for (const id of d.processedBy ?? []) nodes.add(id);
    for (const f of d.flows ?? []) {
      if (edgeById.has(f)) {
        const e = edgeById.get(f)!;
        edges.add(f);
        nodes.add(e.from);
        nodes.add(e.to);
      }
    }
  }

  return renderDiagram({
    layout,
    viewClass: "dataflow",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    emphasizeNodes: nodes,
    emphasizeEdges: edges,
    nodeBadges: badges,
    nodeIcons: resolveNodeIcons(model),
  });
}
