import { describe, expect, it } from "vitest";
import { analyzeTopology } from "../src/topology-analysis.js";
import { projectTopology } from "../src/topology-projection.js";
import type { TopologyModel } from "../src/topology.js";

function fixture(): TopologyModel {
  return {
    resources: [
      { id: "client", parent: null },
      { id: "gateway", parent: "public-subnet" },
      { id: "api", parent: "private-subnet" },
      { id: "db", parent: "data-project" },
    ],
    containers: [
      { id: "app-project", roles: ["administrative"], parent: null },
      { id: "public-subnet", roles: ["network", "security"], parent: "app-project" },
      { id: "private-subnet", roles: ["network"], parent: "app-project" },
      { id: "data-project", roles: ["administrative"], parent: null },
    ],
    overlays: [
      { id: "production", members: [{ type: "resource", id: "gateway" }, { type: "resource", id: "api" }] },
      { id: "pci", members: [{ type: "resource", id: "api" }, { type: "resource", id: "db" }] },
    ],
    edges: [
      { id: "client-gateway", from: "client", to: "gateway", direction: "directed" },
      { id: "gateway-api", from: "gateway", to: "api", direction: "directed" },
      { id: "api-db", from: "api", to: "db", direction: "directed" },
    ],
  };
}

describe("topology projection invariants", () => {
  it("removes incident edges for hidden resources without creating shortcuts", () => {
    const topology = fixture();
    const projection = projectTopology(topology, analyzeTopology(topology), {
      resources: { exclude: ["gateway"] },
    });

    expect(projection.resources.map(({ id }) => id)).toEqual(["client", "api", "db"]);
    expect(projection.edges.map(({ id }) => id)).toEqual(["api-db"]);
    expect(projection.edges.some(({ from, to }) => from === "client" && to === "api")).toBe(false);
  });

  it("only returns canonical edge identities and never mutates authored topology", () => {
    const topology = fixture();
    const originalEdges = topology.edges.map((edge) => ({ ...edge }));
    const projection = projectTopology(topology, analyzeTopology(topology), {
      edges: { include: ["gateway-api", "missing"] },
    });

    expect(projection.edges).toEqual([topology.edges[1]]);
    expect(topology.edges).toEqual(originalEdges);
  });

  it("keeps crossings visible when their containers are hidden", () => {
    const topology = fixture();
    const projection = projectTopology(topology, analyzeTopology(topology), {
      containers: { exclude: ["app-project", "private-subnet", "data-project"] },
      edges: { include: ["api-db"] },
    });

    expect(projection.containers.map(({ id }) => id)).toEqual(["public-subnet"]);
    expect(projection.analysis.crossingsForEdge("api-db").map(({ boundaryId }) => boundaryId))
      .toEqual(["private-subnet", "app-project", "data-project"]);
  });

  it("can hide crossings independently while retaining containers and edges", () => {
    const topology = fixture();
    const projection = projectTopology(topology, analyzeTopology(topology), {
      crossings: { visible: false },
    });

    expect(projection.containers).toHaveLength(4);
    expect(projection.edges).toHaveLength(3);
    expect(projection.analysis.crossings).toEqual([]);
  });

  it.each([
    ["network", ["client-gateway", "gateway-api", "api-db"]],
    ["security", ["client-gateway", "gateway-api"]],
    ["administrative", ["client-gateway", "api-db"]],
  ])("deterministically filters %s crossing edges", (role, expected) => {
    const topology = fixture();
    const analysis = analyzeTopology(topology);
    const first = projectTopology(topology, analysis, { edges: { crossingRoles: [role] } });
    const second = projectTopology(topology, analysis, { edges: { crossingRoles: [role] } });

    expect(first.edges.map(({ id }) => id)).toEqual(expected);
    expect(second.edges.map(({ id }) => id)).toEqual(expected);
  });

  it("filters overlay transition sets without changing their stable order", () => {
    const topology = fixture();
    const projection = projectTopology(topology, analyzeTopology(topology), {
      overlays: { include: ["pci"] },
      edges: { include: ["gateway-api"] },
    });

    expect(projection.analysis.overlayTransitionForEdge("gateway-api")).toEqual({
      edgeId: "gateway-api",
      traversal: "forward",
      gained: ["pci"],
      lost: [],
      shared: [],
    });
  });
});
