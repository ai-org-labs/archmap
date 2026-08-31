import { describe, expect, it } from "vitest";
import {
  createTopologyAnalysis,
  type TopologyAnalysisResult,
  type TopologyModel,
} from "../src/index.js";

describe("ArchMap Next topology contracts", () => {
  it("keeps authored topology separate from derived analysis", () => {
    const topology: TopologyModel = {
      resources: [
        { id: "client", parent: null },
        { id: "api", parent: "subnet" },
      ],
      containers: [
        { id: "project", roles: ["administrative"], parent: null },
        { id: "subnet", roles: ["network"], parent: "project" },
      ],
      overlays: [
        {
          id: "production",
          members: [{ type: "resource", id: "api" }],
          render: "highlight",
        },
      ],
      edges: [
        {
          id: "client-api",
          from: "client",
          to: "api",
          direction: "directed",
          protocol: "https",
          port: 443,
        },
      ],
    };

    expect(topology).not.toHaveProperty("analysis");
    expect(topology.edges[0]).toMatchObject({ from: "client", to: "api" });
  });

  it("queries derived crossings and overlay transitions by Edge traversal", () => {
    const result: TopologyAnalysisResult = {
      crossings: [
        {
          id: "client-api:forward:0",
          edgeId: "client-api",
          traversal: "forward",
          sequence: 0,
          boundaryId: "project",
          direction: "enter",
          roles: ["administrative"],
        },
        {
          id: "client-api:forward:1",
          edgeId: "client-api",
          traversal: "forward",
          sequence: 1,
          boundaryId: "subnet",
          direction: "enter",
          roles: ["network"],
        },
      ],
      overlayTransitions: [
        {
          edgeId: "client-api",
          traversal: "forward",
          gained: ["production"],
          lost: [],
          shared: [],
        },
      ],
    };

    const analysis = createTopologyAnalysis(result);

    expect(analysis.crossingsForEdge("client-api").map((item) => item.boundaryId))
      .toEqual(["project", "subnet"]);
    expect(analysis.crossingsForEdge("client-api", "reverse")).toEqual([]);
    expect(analysis.overlayTransitionForEdge("client-api")).toMatchObject({
      gained: ["production"],
    });
    expect(analysis.overlayTransitionForEdge("missing")).toBeUndefined();
  });
});
