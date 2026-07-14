import type { ArchMapModel, RuntimeHealth, RuntimeMetric, RuntimeValueSource } from "./types.js";

export type RuntimeGraphMode = "design" | "runtime" | "diff";
export type RuntimeMeasure = "requests" | "errors" | "latencyP95" | "throughput" | "saturation";
export type RuntimeGroupBy = "none" | "environment" | "team" | "region" | "zone";

export interface RuntimeGraphNode {
  id: string;
  nodeId: string;
  label: string;
  kind?: string;
  zone?: string;
  environment?: string;
  team?: string;
  region?: string;
  health: RuntimeHealth;
  source: RuntimeValueSource;
  metrics: Record<string, RuntimeMetric>;
  diff: "matched" | "design_only" | "runtime_only" | "degraded";
  members?: string[];
}

export interface RuntimeGraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  protocol?: string;
  health: RuntimeHealth;
  source: RuntimeValueSource;
  metrics: Record<string, RuntimeMetric>;
  count: number;
}

export interface RuntimeGraph {
  mode: RuntimeGraphMode;
  nodes: RuntimeGraphNode[];
  edges: RuntimeGraphEdge[];
  events: NonNullable<ArchMapModel["runtime"]>["events"];
  window?: NonNullable<ArchMapModel["runtime"]>["window"];
  projected: boolean;
}

const EMPTY_METRICS: Record<string, RuntimeMetric> = Object.freeze({});

function fallbackSource(source: RuntimeValueSource | undefined): RuntimeValueSource {
  return source === "measured" || source === "estimated" ? source : "declared";
}

function fallbackHealth(value: RuntimeHealth | undefined): RuntimeHealth {
  return value ?? "no-data";
}

export function runtimeMetricValue(metrics: Record<string, RuntimeMetric>, measure: RuntimeMeasure): number | undefined {
  const direct = metrics[measure]?.value;
  if (Number.isFinite(direct)) return direct;
  if (measure === "errors") {
    const rate = metrics.errorRate?.value;
    if (Number.isFinite(rate)) return rate;
  }
  if (measure === "requests") {
    const rate = metrics.requestRate?.value;
    if (Number.isFinite(rate)) return rate;
  }
  return undefined;
}

export function buildRuntimeGraph(model: ArchMapModel, mode: RuntimeGraphMode = "runtime"): RuntimeGraph {
  const runtime = model.runtime;
  const servicesByNode = new Map((runtime?.services ?? []).map((service) => [service.node, service]));
  const serviceIds = new Map((runtime?.services ?? []).map((service) => [service.id, service.node]));
  const includeRuntimeOnly = mode !== "design";
  const nodes: RuntimeGraphNode[] = [];

  for (const node of model.nodes) {
    const service = servicesByNode.get(node.id);
    if (mode === "runtime" && runtime?.services.length && !service) continue;
    const health = fallbackHealth(service?.health);
    nodes.push({
      id: node.id,
      nodeId: node.id,
      label: node.label ?? service?.description ?? node.id,
      kind: node.kind,
      zone: node.zone,
      environment: service?.environment,
      team: service?.team,
      region: service?.region,
      health,
      source: fallbackSource(service?.source),
      metrics: service?.metrics ?? EMPTY_METRICS,
      diff: !service ? "design_only" : health === "warning" || health === "critical" ? "degraded" : "matched",
    });
  }

  if (includeRuntimeOnly) {
    for (const service of runtime?.services ?? []) {
      if (model.nodes.some((node) => node.id === service.node)) continue;
      nodes.push({
        id: service.id,
        nodeId: service.node,
        label: service.description ?? service.id,
        environment: service.environment,
        team: service.team,
        region: service.region,
        health: fallbackHealth(service.health),
        source: fallbackSource(service.source),
        metrics: service.metrics ?? EMPTY_METRICS,
        diff: "runtime_only",
      });
    }
  }

  const visible = new Set(nodes.map((node) => node.id));
  const runtimeEdges = runtime?.dependencies ?? [];
  const edges: RuntimeGraphEdge[] = [];
  if (mode !== "design" && runtimeEdges.length > 0) {
    for (const edge of runtimeEdges) {
      const from = serviceIds.get(edge.from) ?? edge.from;
      const to = serviceIds.get(edge.to) ?? edge.to;
      if (!visible.has(from) || !visible.has(to)) continue;
      edges.push({
        id: edge.id,
        from,
        to,
        label: edge.description,
        protocol: edge.protocol,
        health: fallbackHealth(edge.health),
        source: fallbackSource(edge.source),
        metrics: edge.metrics ?? EMPTY_METRICS,
        count: 1,
      });
    }
  } else {
    for (const edge of model.edges) {
      if (!visible.has(edge.from) || !visible.has(edge.to)) continue;
      edges.push({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        protocol: edge.protocol,
        health: "no-data",
        source: "declared",
        metrics: EMPTY_METRICS,
        count: 1,
      });
    }
  }
  return { mode, nodes, edges, events: runtime?.events ?? [], window: runtime?.window, projected: false };
}

function groupValue(node: RuntimeGraphNode, groupBy: RuntimeGroupBy): string {
  if (groupBy === "none") return node.id;
  return node[groupBy] ?? "unassigned";
}

const HEALTH_RANK: RuntimeHealth[] = ["no-data", "unknown", "normal", "warning", "critical"];

export function projectRuntimeGraph(
  graph: RuntimeGraph,
  groupBy: RuntimeGroupBy = "none",
  threshold = 80,
): RuntimeGraph {
  if (graph.nodes.length <= threshold || groupBy === "none") return graph;
  const buckets = new Map<string, RuntimeGraphNode[]>();
  for (const node of graph.nodes) {
    const key = groupValue(node, groupBy);
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }
  const nodeToGroup = new Map<string, string>();
  const nodes = [...buckets].map(([key, members]) => {
    const id = `group:${groupBy}:${key}`;
    members.forEach((member) => nodeToGroup.set(member.id, id));
    const worst = members.reduce<RuntimeHealth>((health, member) =>
      HEALTH_RANK.indexOf(member.health) > HEALTH_RANK.indexOf(health) ? member.health : health, "no-data");
    return {
      id,
      nodeId: id,
      label: key,
      kind: `${groupBy} group`,
      health: worst,
      source: members.some((member) => member.source === "measured") ? "measured" : "declared",
      metrics: EMPTY_METRICS,
      diff: members.some((member) => member.diff === "degraded") ? "degraded" : "matched",
      members: members.map((member) => member.id),
    } satisfies RuntimeGraphNode;
  });
  const aggregated = new Map<string, RuntimeGraphEdge>();
  for (const edge of graph.edges) {
    const from = nodeToGroup.get(edge.from);
    const to = nodeToGroup.get(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    const current = aggregated.get(key);
    if (current) current.count += 1;
    else aggregated.set(key, { ...edge, id: `aggregate:${key}`, from, to });
  }
  return { ...graph, nodes, edges: [...aggregated.values()], projected: true };
}

export function runtimeGraphToJson(graph: RuntimeGraph): string {
  return JSON.stringify(graph, null, 2);
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function runtimeGraphToCsv(graph: RuntimeGraph): string {
  const rows = [["id", "from", "to", "health", "source", "protocol", "count"]];
  for (const edge of graph.edges) rows.push([edge.id, edge.from, edge.to, edge.health, edge.source, edge.protocol ?? "", String(edge.count)]);
  return rows.map((row) => row.map(csv).join(",")).join("\n");
}
