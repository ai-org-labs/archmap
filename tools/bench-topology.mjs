#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { analyzeTopology, projectTopology } from "../dist/archmap.js";

function fixture(size) {
  const containerCount = Math.max(2, Math.ceil(size / 100));
  const containers = Array.from({ length: containerCount }, (_, index) => ({
    id: `container-${index}`,
    label: `Container ${index}`,
    kind: "generic",
    roles: [index % 2 === 0 ? "network" : "administrative"],
    parent: null,
  }));
  const resources = Array.from({ length: size }, (_, index) => ({
    id: `resource-${index}`,
    label: `Resource ${index}`,
    kind: "runtime_service",
    parent: containers[index % containerCount].id,
  }));
  const overlays = [
    {
      id: "production",
      label: "Production",
      roles: ["environment"],
      render: "highlight",
      members: resources
        .filter((_resource, index) => index % 2 === 0)
        .map((resource) => ({ type: "resource", id: resource.id })),
    },
    {
      id: "regulated",
      label: "Regulated",
      roles: ["security"],
      render: "outline",
      members: resources
        .filter((_resource, index) => index % 5 === 0)
        .map((resource) => ({ type: "resource", id: resource.id })),
    },
  ];
  const edges = resources.slice(1).map((resource, index) => ({
    id: `edge-${index}`,
    from: resources[index].id,
    to: resource.id,
    direction: index % 20 === 0 ? "bidirectional" : "directed",
    protocol: "https",
    port: 443,
  }));
  return { resources, containers, overlays, edges };
}

function signature(analysis) {
  return JSON.stringify({
    crossings: analysis.crossings,
    overlayTransitions: analysis.overlayTransitions,
    diagnostics: analysis.diagnostics,
  });
}

const results = [];
for (const size of [120, 1000]) {
  const topology = fixture(size);
  const started = performance.now();
  const first = analyzeTopology(topology);
  const analyzedAt = performance.now();
  const second = analyzeTopology(topology);
  const repeatedAt = performance.now();
  const projected = projectTopology(topology, first, {
    edges: { crossingRoles: ["network"] },
    crossings: { roles: ["network"] },
  });
  const projectedAt = performance.now();

  if (!first.valid) throw new Error(`Topology fixture ${size} is invalid.`);
  if (signature(first) !== signature(second)) {
    throw new Error(`Topology analysis is not deterministic for ${size} Resources.`);
  }
  if (projected.edges.some((edge) => !topology.edges.some(({ id }) => id === edge.id))) {
    throw new Error(`Projection synthesized an Edge for ${size} Resources.`);
  }

  results.push({
    resources: topology.resources.length,
    edges: topology.edges.length,
    containers: topology.containers.length,
    crossings: first.crossings.length,
    transitions: first.overlayTransitions.length,
    projectedEdges: projected.edges.length,
    analyzeMs: Number((analyzedAt - started).toFixed(2)),
    repeatMs: Number((repeatedAt - analyzedAt).toFixed(2)),
    projectMs: Number((projectedAt - repeatedAt).toFixed(2)),
  });
}

console.log(JSON.stringify({
  benchmark: "archmap-next-topology",
  node: process.version,
  deterministic: true,
  results,
}, null, 2));
