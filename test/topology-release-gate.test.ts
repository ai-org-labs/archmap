import { describe, expect, it } from "vitest";
import { analyzeTopology } from "../src/topology-analysis.js";
import { projectTopology } from "../src/topology-projection.js";
import type { TopologyModel } from "../src/topology.js";

function topologyFixture(size: number): TopologyModel {
  const containers = ["west", "east"].map((id) => ({
    id,
    label: id,
    kind: "region",
    roles: ["network"],
    parent: null,
  }));
  const resources = Array.from({ length: size }, (_, index) => ({
    id: `resource-${index}`,
    label: `Resource ${index}`,
    kind: "runtime_service",
    parent: containers[index % 2].id,
  }));
  return {
    resources,
    containers,
    overlays: [{
      id: "production",
      roles: ["environment"],
      members: resources
        .filter((_resource, index) => index % 2 === 0)
        .map((resource) => ({ type: "resource" as const, id: resource.id })),
    }],
    edges: resources.slice(1).map((resource, index) => ({
      id: `edge-${index}`,
      from: resources[index].id,
      to: resource.id,
      direction: "directed",
      protocol: "https",
      port: 443,
    })),
  };
}

describe("ArchMap Next release contracts", () => {
  it.each([120, 1000])("derives deterministic analysis for %i Resources", (size) => {
    const topology = topologyFixture(size);
    const first = analyzeTopology(topology);
    const second = analyzeTopology(topology);

    expect(first.valid).toBe(true);
    expect(first.crossings.length).toBe((size - 1) * 2);
    expect(first.overlayTransitions.length).toBe(size - 1);
    expect({
      crossings: first.crossings,
      overlayTransitions: first.overlayTransitions,
      diagnostics: first.diagnostics,
    }).toEqual({
      crossings: second.crossings,
      overlayTransitions: second.overlayTransitions,
      diagnostics: second.diagnostics,
    });
  });

  it("removes incident Edges instead of inventing projection shortcuts", () => {
    const topology = topologyFixture(4);
    const analysis = analyzeTopology(topology);
    const projected = projectTopology(topology, analysis, {
      resources: { exclude: ["resource-1"] },
    });

    expect(projected.edges.map(({ id }) => id)).toEqual(["edge-2"]);
    expect(projected.edges).not.toContainEqual(expect.objectContaining({
      from: "resource-0",
      to: "resource-2",
    }));
  });

  it("keeps Crossing analysis independent from Container visibility", () => {
    const topology = topologyFixture(3);
    const analysis = analyzeTopology(topology);
    const projected = projectTopology(topology, analysis, {
      containers: { exclude: ["west", "east"] },
    });

    expect(projected.containers).toEqual([]);
    expect(projected.analysis.crossings).toEqual(analysis.crossings);
  });
});
