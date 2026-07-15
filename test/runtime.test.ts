import { describe, expect, it } from "vitest";
import {
  buildRuntimeGraph,
  getView,
  parse,
  projectRuntimeGraph,
  runtimeGraphToCsv,
  runtimeGraphToJson,
  toCanonicalModel,
} from "../src/index.js";

const source = `graph LR
  Web[Web] --> API[API]
  API --> DB[(DB)]
---
nodes:
  Web: { zone: edge, kind: web_app }
  API: { zone: runtime, kind: api_gateway }
  DB: { zone: data, kind: relational_database }
runtime:
  window: { observedAt: 2026-07-15T10:00:00Z }
  services:
    Web:
      health: normal
      source: measured
      environment: production
      metrics: { requests: { value: 1200, unit: req } }
    API:
      health: warning
      source: estimated
      environment: production
      metrics: { latencyP95: { value: 420, unit: ms } }
    DB:
      health: normal
      source: declared
      environment: production
  dependencies:
    web_api:
      from: Web
      to: API
      health: warning
      source: measured
      protocol: HTTPS
      metrics: { requests: { value: 1200, unit: req } }
  events:
    deploy_api:
      type: deployment
      target: API
      at: 2026-07-15T09:55:00Z
      label: API deployed
`;

describe("runtime DSL", () => {
  it("parses and preserves an authored runtime snapshot", () => {
    const model = parse(source);
    expect(model.runtime?.services).toHaveLength(3);
    expect(model.runtime?.services[1].metrics.latencyP95.value).toBe(420);
    expect(model.runtime?.dependencies[0].protocol).toBe("HTTPS");
    expect(model.runtime?.events[0].target).toBe("API");
    expect(model.runtime?.events[0].at).toBe("2026-07-15T09:55:00.000Z");
    expect(model.runtime?.window?.observedAt).toBe("2026-07-15T10:00:00.000Z");
    expect(model.diagnostics.map((entry) => entry.code)).not.toContain("runtime_event_missing_time");
    expect(toCanonicalModel(model).runtime).toEqual(model.runtime);
  });

  it("projects Design, Runtime, and Diff from the same canonical graph", () => {
    const model = parse(source);
    expect(buildRuntimeGraph(model, "design").nodes).toHaveLength(3);
    const runtime = buildRuntimeGraph(model, "runtime");
    expect(runtime.edges[0].source).toBe("measured");
    expect(runtime.edges.find((edge) => edge.from === "API" && edge.to === "DB")).toMatchObject({
      health: "no-data",
      source: "declared",
    });
    expect(buildRuntimeGraph(model, "diff").nodes.find((node) => node.id === "API")?.diff).toBe("degraded");
  });

  it("keeps unobserved design components visible as No data", () => {
    const model = parse(source);
    model.runtime!.services = model.runtime!.services.filter((service) => service.node !== "DB");
    const runtime = buildRuntimeGraph(model, "runtime");
    expect(runtime.nodes.find((node) => node.id === "DB")).toMatchObject({
      health: "no-data",
      source: "declared",
      diff: "design_only",
    });
  });

  it("clusters large authored graphs without expanding every node", () => {
    const model = parse(source);
    const graph = buildRuntimeGraph(model, "runtime");
    const large = { ...graph, nodes: Array.from({ length: 120 }, (_, index) => ({ ...graph.nodes[index % 3], id: `N${index}`, nodeId: `N${index}`, environment: index % 2 ? "prod" : "stage" })), edges: [] };
    const projected = projectRuntimeGraph(large, "environment", 80);
    expect(projected.projected).toBe(true);
    expect(projected.nodes).toHaveLength(2);
  });

  it("exports deterministic JSON and CSV and registers the Runtime view", () => {
    const graph = buildRuntimeGraph(parse(source), "runtime");
    expect(JSON.parse(runtimeGraphToJson(graph)).mode).toBe("runtime");
    expect(runtimeGraphToCsv(graph)).toContain("web_api,Web,API");
    expect(getView("runtime")).toBeTypeOf("function");
  });

  it("diagnoses unknown runtime references and invalid provenance", () => {
    const model = parse(`graph LR\n  A[A]\n---\nruntime:\n  services:\n    Missing: { node: Missing, health: normal, source: magic }`);
    expect(model.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(["runtime_unknown_node", "runtime_invalid_source"]));
  });
});
