#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { buildRuntimeGraph, projectRuntimeGraph } from "../dist/archmap.js";

function fixture(size) {
  const nodes = Array.from({ length: size }, (_, index) => ({
    id: `service-${index}`,
    label: `Service ${index}`,
    kind: "runtime_service",
    zone: `zone-${index % 20}`,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${index}`,
    from: nodes[index].id,
    to: node.id,
  }));
  return {
    direction: "LR", nodes, edges, zones: [], boundaries: [], identities: [], permissions: [], data: [], subgraphs: [],
    errors: [], warnings: [], suggestions: [], infos: [], diagnostics: [], source: "",
    runtime: {
      services: nodes.map((node, index) => ({
        id: `runtime-${index}`, node: node.id, source: index % 3 === 0 ? "measured" : "declared",
        health: index % 29 === 0 ? "warning" : "normal", environment: index % 2 ? "production" : "staging",
        team: `team-${index % 12}`, region: `region-${index % 5}`,
        metrics: { requests: { value: index + 1, unit: "rpm", source: "measured" } },
      })),
      dependencies: edges.map((edge, index) => ({ ...edge, source: "declared", health: "normal", metrics: {}, protocol: index % 2 ? "HTTP" : "gRPC" })),
      events: [],
    },
  };
}

console.log("ArchMap Runtime projection benchmark");
for (const size of [100, 1000, 10000]) {
  const model = fixture(size);
  const started = performance.now();
  const graph = buildRuntimeGraph(model, "runtime");
  const normalizedAt = performance.now();
  const projected = projectRuntimeGraph(graph, "team", 80);
  const projectedAt = performance.now();
  console.log(`${size}: normalize=${(normalizedAt - started).toFixed(1)}ms project=${(projectedAt - normalizedAt).toFixed(1)}ms output=${projected.nodes.length} nodes/${projected.edges.length} edges`);
  if (projected.nodes.length > 12) throw new Error(`Projection failed for ${size} elements.`);
}
