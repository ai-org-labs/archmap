import { describe, expect, it } from "vitest";
import {
  analyzeTopology,
  type LegacyBoundaryCrossingAssertion,
  type TopologyModel,
} from "../src/index.js";

function fixture(direction: "directed" | "bidirectional" = "directed"): TopologyModel {
  return {
    resources: [
      { id: "external", parent: null },
      { id: "api", parent: "subnet-a", extensions: { x: 10, y: 20 } },
      { id: "worker", parent: "subnet-a" },
      { id: "db", parent: "vpc-b", extensions: { x: 900, y: 700 } },
    ],
    containers: [
      { id: "project-a", roles: ["administrative"], parent: null },
      { id: "vpc-a", roles: ["network"], parent: "project-a" },
      { id: "subnet-a", roles: ["network"], parent: "vpc-a" },
      { id: "project-b", roles: ["administrative"], parent: null },
      { id: "vpc-b", roles: ["network", "security"], parent: "project-b" },
    ],
    overlays: [
      { id: "production", members: [{ type: "resource", id: "api" }, { type: "resource", id: "db" }] },
      { id: "pci", members: [{ type: "resource", id: "api" }] },
      { id: "target-only", members: [{ type: "resource", id: "db" }] },
      { id: "container-note", members: [{ type: "container", id: "vpc-b" }] },
    ],
    edges: [{ id: "api-db", from: "api", to: "db", direction }],
  };
}

describe("derived topology analysis", () => {
  it("emits source-inner exits followed by target-outer enters", () => {
    const analysis = analyzeTopology(fixture());

    expect(analysis.valid).toBe(true);
    expect(analysis.crossingsForEdge("api-db", "forward")).toEqual([
      expect.objectContaining({ sequence: 0, boundaryId: "subnet-a", direction: "exit", roles: ["network"] }),
      expect.objectContaining({ sequence: 1, boundaryId: "vpc-a", direction: "exit", roles: ["network"] }),
      expect.objectContaining({ sequence: 2, boundaryId: "project-a", direction: "exit", roles: ["administrative"] }),
      expect.objectContaining({ sequence: 3, boundaryId: "project-b", direction: "enter", roles: ["administrative"] }),
      expect.objectContaining({ sequence: 4, boundaryId: "vpc-b", direction: "enter", roles: ["network", "security"] }),
    ]);
  });

  it("handles same-container and uncontained-to-nested communication", () => {
    const topology = fixture();
    topology.edges = [
      { id: "same", from: "api", to: "worker", direction: "directed" },
      { id: "enter", from: "external", to: "db", direction: "directed" },
    ];
    const analysis = analyzeTopology(topology);

    expect(analysis.crossingsForEdge("same")).toEqual([]);
    expect(analysis.crossingsForEdge("enter").map(({ boundaryId, direction }) => [boundaryId, direction])).toEqual([
      ["project-b", "enter"],
      ["vpc-b", "enter"],
    ]);
  });

  it("makes reverse bidirectional traversal the exact inverse", () => {
    const analysis = analyzeTopology(fixture("bidirectional"));
    const forward = analysis.crossingsForEdge("api-db", "forward");
    const reverse = analysis.crossingsForEdge("api-db", "reverse");

    expect(reverse.map(({ boundaryId, direction }) => [boundaryId, direction])).toEqual(
      forward.slice().reverse().map(({ boundaryId, direction }) => [
        boundaryId,
        direction === "enter" ? "exit" : "enter",
      ]),
    );
    expect(reverse.map(({ sequence }) => sequence)).toEqual([0, 1, 2, 3, 4]);
  });

  it("derives stable explicit Overlay transitions without expanding Container membership", () => {
    const analysis = analyzeTopology(fixture("bidirectional"));

    expect(analysis.overlayTransitionForEdge("api-db", "forward")).toEqual({
      edgeId: "api-db",
      traversal: "forward",
      gained: ["target-only"],
      lost: ["pci"],
      shared: ["production"],
    });
    expect(analysis.overlayTransitionForEdge("api-db", "reverse")).toEqual({
      edgeId: "api-db",
      traversal: "reverse",
      gained: ["pci"],
      lost: ["target-only"],
      shared: ["production"],
    });
  });

  it("is unchanged by geometry-like extension metadata", () => {
    const first = fixture();
    const second = structuredClone(first);
    second.resources[1].extensions = { x: -5000, y: 12000, pan: 8, zoom: 0.25 };
    second.resources[3].extensions = { x: 1, y: 2, drag: true };

    const a = analyzeTopology(first);
    const b = analyzeTopology(second);
    expect(b.crossings).toEqual(a.crossings);
    expect(b.overlayTransitions).toEqual(a.overlayTransitions);
  });

  it("diagnoses legacy assertions only when they disagree with derived facts", () => {
    const assertions: LegacyBoundaryCrossingAssertion[] = [
      {
        edgeId: "api-db",
        expectation: "crossing",
        boundaryIds: [],
        reviewed: false,
        provenance: { source: "legacy", type: "edge", id: "api-db" },
      },
      {
        edgeId: "api-db",
        expectation: "specific-boundaries",
        boundaryIds: ["pci"],
        reviewed: true,
        provenance: { source: "legacy", type: "edge", id: "api-db" },
      },
    ];
    const analysis = analyzeTopology(fixture(), { legacyAssertions: assertions });

    expect(analysis.diagnostics.filter(({ code }) => code === "legacy_crossing_assertion_mismatch")).toHaveLength(1);
  });

  it("reports invalid endpoint and Overlay references", () => {
    const topology = fixture();
    topology.edges.push({ id: "broken", from: "missing", to: "api", direction: "directed" });
    topology.overlays.push({ id: "broken-overlay", members: [{ type: "resource", id: "missing" }] });
    const analysis = analyzeTopology(topology);

    expect(analysis.valid).toBe(false);
    expect(analysis.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "topology_edge_endpoint_unknown",
      "topology_overlay_member_unknown",
    ]));
    expect(analysis.crossingsForEdge("broken")).toEqual([]);
  });
});
