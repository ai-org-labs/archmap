import { describe, expect, it } from "vitest";
import { normalizeTopology, parse } from "../src/index.js";

describe("legacy topology normalization", () => {
  it("maps released architecture semantics without treating layer or subgraph as containment", () => {
    const model = parse(`graph LR
      subgraph Presentation
        Web[Web]
      end
      Web --> API[API]
      ---
      nodes:
        Web: { zone: private, layer: client, kind: web_app }
        API: { zone: platform, layer: runtime, kind: api }
      zones:
        platform: { label: Platform, contains: [private, API] }
        private: { label: Private, contains: [Web] }
      boundaries:
        regulated:
          label: Regulated scope
          contains: [Web, private]
      edges:
        Web->API: { protocol: HTTPS, direction: request_response, boundaryCrossing: [regulated] }
    `);

    const result = normalizeTopology(model);
    const web = result.topology.resources.find((resource) => resource.id === "Web");
    const api = result.topology.resources.find((resource) => resource.id === "API");
    const privateContainer = result.topology.containers.find((container) => container.id === "private");
    const overlay = result.topology.overlays.find((item) => item.id === "regulated");
    const edge = result.topology.edges[0];

    expect(web?.parent).toBe("private");
    expect(api?.parent).toBe("platform");
    expect(privateContainer?.parent).toBe("platform");
    expect(web?.extensions?.["archmap.legacy.layer"]).toBe("client");
    expect(web?.provenance).toEqual([{ source: "legacy", type: "node", id: "Web" }]);
    expect(overlay?.members).toEqual([
      { type: "resource", id: "Web" },
      { type: "container", id: "private" },
    ]);
    expect(edge?.direction).toBe("bidirectional");
    expect(result.legacyAssertions).toEqual([{
      edgeId: edge?.id,
      expectation: "specific-boundaries",
      boundaryIds: ["regulated"],
      reviewed: true,
      provenance: { source: "legacy", type: "edge", id: edge?.id },
    }]);
    expect(result.topology).not.toHaveProperty("crossings");
  });

  it("keeps false and boolean crossing declarations as compatibility assertions", () => {
    const model = parse(`graph LR
      A --> B
      B --> C
      ---
      edges:
        A->B: { boundaryCrossing: true }
        B->C: { boundaryCrossing: false }
    `);

    const result = normalizeTopology(model);
    expect(result.legacyAssertions.map(({ expectation }) => expectation)).toEqual([
      "crossing",
      "no-crossing",
    ]);
    expect(result.diagnostics.filter(({ code }) => code === "legacy_boundary_crossing_assertion_preserved")).toHaveLength(2);
  });
});
