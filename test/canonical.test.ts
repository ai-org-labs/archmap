import { describe, expect, it } from "vitest";
import { parse, toCanonicalModel } from "../src/index.js";

describe("canonical model adapter (Stage 2, spec 02 §4)", () => {
  it("projects the compatibility model into Record-keyed collections", () => {
    const model = parse(`graph LR
      subgraph edge [Edge]
        Web[Web] --> API[API]
      end
      ---
      nodes:
        Web: { layer: client, kind: web_app }
        API: { layer: runtime, kind: api_gateway }
      edges:
        Web->API: { flow: request }
    `);
    const canonical = toCanonicalModel(model);

    expect(canonical.graph.direction).toBe("LR");
    expect(canonical.source?.graph).toContain("subgraph edge");
    expect(canonical.source?.metadata).toContain("nodes:");
    expect(canonical.graph.subgraphs.edge).toEqual({ id: "edge", label: "Edge", members: ["Web", "API"] });
    expect(canonical.nodes.Web.label).toBe("Web");
    expect(canonical.edges[model.edges[0].id].pairKey).toBe("Web->API");
    expect(Object.keys(canonical.nodes).sort()).toEqual(["API", "Web"]);
    expect(canonical.diagnostics).toEqual([
      ...model.errors,
      ...model.warnings,
      ...model.suggestions,
      ...model.infos,
    ]);
  });
});
