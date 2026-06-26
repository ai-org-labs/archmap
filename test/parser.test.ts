import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, extractArchMapBlocks } from "../src/index.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);

describe("graph section", () => {
  it("parses direction and the four node shapes", () => {
    const m = parse(`graph TD
      A[Rect]
      B[(Db)]
      C((Circle))
      D{Diamond}
    `);
    expect(m.direction).toBe("TD");
    const byId = Object.fromEntries(m.nodes.map((n) => [n.id, n]));
    expect(byId.A.shape).toBe("rectangle");
    expect(byId.B.shape).toBe("database");
    expect(byId.C.shape).toBe("circle");
    expect(byId.D.shape).toBe("diamond");
    expect(byId.B.label).toBe("Db");
  });

  it("parses plain and labelled edges and reuses bare references", () => {
    const m = parse(`graph LR
      Web[Web App] -->|HTTPS + JWT| API[API Gateway]
      API --> App[Cloud Run]
    `);
    expect(m.nodes).toHaveLength(3);
    const labelled = m.edges.find((e) => e.from === "Web" && e.to === "API");
    expect(labelled?.label).toBe("HTTPS + JWT");
    expect(m.edges.find((e) => e.from === "API" && e.to === "App")).toBeTruthy();
  });

  it("defaults to LR with a warning when no directive is present", () => {
    const m = parse(`A[a] --> B[b]`);
    expect(m.direction).toBe("LR");
    expect(m.warnings.some((w) => w.code === "missing_direction")).toBe(true);
  });
});

describe("metadata merge", () => {
  it("merges node metadata onto graph nodes", () => {
    const m = parse(`graph LR
      App[Cloud Run]
      ---
      nodes:
        App:
          zone: gcp
          layer: runtime
          kind: serverless_service
    `);
    const app = m.nodes.find((n) => n.id === "App")!;
    expect(app.zone).toBe("gcp");
    expect(app.kind).toBe("serverless_service");
  });

  it("reconciles metadata edges with graph edges by endpoints and adopts the id", () => {
    const m = parse(example);
    const webApi = m.edges.find((e) => e.id === "web_api")!;
    expect(webApi.from).toBe("Web");
    expect(webApi.to).toBe("APIGW");
    expect(webApi.auth?.issuer).toBe("FirebaseAuth");
    // No duplicate Web->APIGW edge should remain with a generated id.
    expect(m.edges.filter((e) => e.from === "Web" && e.to === "APIGW")).toHaveLength(1);
  });

  it("builds all model collections from the example", () => {
    const m = parse(example);
    expect(m.zones.map((z) => z.id).sort()).toEqual(["aws", "client", "gcp", "onprem"]);
    expect(m.boundaries).toHaveLength(2);
    expect(m.identities[0].id).toBe("gcp-app-sa");
    expect(m.permissions[0].resource).toBe("CloudSQL");
    expect(m.data[0].classification).toBe("personal");
  });
});

describe("pair-key edges (Stage 1, spec 01 §7 / 02 §6)", () => {
  it("enriches the matching graph edge via a pair key, keeping a generated id", () => {
    const m = parse(`graph LR
      Web[Web App] -->|HTTPS| API[API Gateway]
      ---
      edges:
        Web->API: { flow: request, protocol: HTTPS, auth: { token: JWT } }
    `);
    const e = m.edges.find((x) => x.from === "Web" && x.to === "API")!;
    expect(e.flow).toBe("request");
    expect(e.auth?.token).toBe("JWT");
    expect(e.source).toBe("graph+metadata");
    // pair key is a selector, not a stable id => generated id pattern.
    expect(e.id).toMatch(/Web__API__\d+/);
    expect(e.graphLabel).toBe("HTTPS");
  });

  it("emits edge_pair_ambiguous when a pair key matches multiple graph edges", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      A --> B
      ---
      edges:
        A->B: { flow: request }
    `);
    expect(m.warnings.some((w) => w.code === "edge_pair_ambiguous")).toBe(true);
  });

  it("creates a metadata-only edge when a pair key matches no graph edge", () => {
    const m = parse(`graph LR
      A[a]
      B[b]
      ---
      edges:
        A->B: { flow: request }
    `);
    const e = m.edges.find((x) => x.from === "A" && x.to === "B");
    expect(e?.source).toBe("metadata");
    expect(e?.flow).toBe("request");
  });
});

describe("inference (§22)", () => {
  it("infers protocol and token from labels without overwriting explicit values", () => {
    const m = parse(`graph LR
      A[a] -->|HTTPS + JWT| B[b]
    `);
    const e = m.edges[0];
    expect(e.protocol).toBe("HTTPS");
    expect(e.auth?.token).toBe("JWT");
    expect(e.inferred).toContain("protocol");
    expect(e.inferred).toContain("auth.token");
  });

  it("does not overwrite explicit protocol", () => {
    const m = parse(`graph LR
      A[a] -->|HTTPS| B[b]
      ---
      edges:
        e1:
          from: A
          to: B
          protocol: HTTP
    `);
    const e = m.edges.find((x) => x.id === "e1")!;
    expect(e.protocol).toBe("HTTP");
    expect(e.inferred ?? []).not.toContain("protocol");
  });
});

describe("validation (§23)", () => {
  it("errors on duplicate node definitions", () => {
    const m = parse(`graph LR
      A[one]
      A[two]
    `);
    expect(m.errors.some((e) => e.code === "duplicate_node")).toBe(true);
  });

  it("errors when an edge references an unknown node", () => {
    const m = parse(`graph LR
      A[a]
      ---
      edges:
        e1:
          from: A
          to: Ghost
    `);
    expect(m.errors.some((e) => e.code === "edge_unknown_target")).toBe(true);
  });

  it("errors on invalid YAML", () => {
    const m = parse(`graph LR
      A[a]
      ---
      nodes: : :
    `);
    expect(m.errors.some((e) => e.code === "invalid_yaml")).toBe(true);
  });

  it("warns on unknown kind/layer/flow", () => {
    const m = parse(`graph LR
      A[a] -->|x| B[b]
      ---
      nodes:
        A:
          kind: spaceship
          layer: stratosphere
      edges:
        e1:
          from: A
          to: B
          flow: teleport
    `);
    const codes = m.warnings.map((w) => w.code);
    expect(codes).toContain("unknown_kind");
    expect(codes).toContain("unknown_layer");
    expect(codes).toContain("unknown_flow");
  });

  it("warns when a token has no issuer/validator", () => {
    const m = parse(`graph LR
      A[a] -->|JWT| B[b]
    `);
    const codes = m.warnings.map((w) => w.code);
    expect(codes).toContain("auth_token_without_issuer");
    expect(codes).toContain("auth_token_without_validator");
  });

  it("warns when an edge crosses zones without boundaryCrossing", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      ---
      nodes:
        A: { zone: client }
        B: { zone: gcp }
    `);
    expect(m.warnings.some((w) => w.code === "zone_crossing_without_boundary")).toBe(true);
  });

  it("warns on permission referencing unknown principal/resource", () => {
    const m = parse(`graph LR
      A[a]
      ---
      permissions:
        p1:
          principal: nobody
          action: read
          resource: Ghost
    `);
    const codes = m.warnings.map((w) => w.code);
    expect(codes).toContain("permission_unknown_principal");
    expect(codes).toContain("permission_unknown_resource");
  });

  it("the example model is error-free", () => {
    const m = parse(example);
    expect(m.errors).toEqual([]);
  });
});

describe("markdown extraction (§5)", () => {
  it("extracts archmap blocks", () => {
    const md = [
      "# Title",
      "```archmap",
      "graph LR",
      "  A[a] --> B[b]",
      "```",
      "text",
      "```js",
      "not archmap",
      "```",
    ].join("\n");
    const blocks = extractArchMapBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("graph LR");
  });
});
