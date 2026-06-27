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
    expect(m.infos.some((w) => w.code === "missing_direction")).toBe(true);
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

describe("normalization (Stage 2, spec 02)", () => {
  it("normalizes boundaryCrossing authoring forms to the canonical object", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      B --> C[c]
      C --> D[d]
      ---
      edges:
        A->B: { boundaryCrossing: true }
        B->C: { boundaryCrossing: false }
        C->D: { boundaryCrossing: [public_edge, private_net] }
    `);
    const byPair = Object.fromEntries(m.edges.map((e) => [e.pairKey, e]));
    expect(byPair["A->B"].boundaryCrossing).toEqual({ crosses: [], reviewed: true });
    expect(byPair["B->C"].boundaryCrossing).toEqual({ crosses: [], reviewed: true, assertedFalse: true });
    expect(byPair["C->D"].boundaryCrossing).toEqual({ crosses: ["public_edge", "private_net"], reviewed: true });
  });

  it("normalizes edge.data and data.flows into edge.dataIds and stable data flows", () => {
    const m = parse(`graph LR
      Web[Web] --> API[API]
      API --> DB[(DB)]
      ---
      edges:
        Web->API: { data: session }
      data:
        session:
          flows: [API->DB]
    `);
    const webApi = m.edges.find((e) => e.pairKey === "Web->API")!;
    const apiDb = m.edges.find((e) => e.pairKey === "API->DB")!;
    const session = m.data.find((d) => d.id === "session")!;
    expect(webApi.dataIds).toEqual(["session"]);
    expect(apiDb.dataIds).toEqual(["session"]);
    expect(session.flows?.sort()).toEqual([apiDb.id, webApi.id].sort());
  });

  it("resolves zone containment into node.resolvedZone and zone.resolvedContains", () => {
    const m = parse(`graph LR
      App[App]
      DB[(DB)]
      ---
      zones:
        private:
          contains: [App, DB]
    `);
    expect(m.nodes.find((n) => n.id === "App")?.resolvedZone).toBe("private");
    expect(m.zones.find((z) => z.id === "private")?.resolvedContains).toEqual([
      { type: "node", id: "App" },
      { type: "node", id: "DB" },
    ]);
  });

  it("resolves zone parent links and detects parent conflicts", () => {
    const m = parse(`graph LR
      App[App]
      ---
      zones:
        platform:
          contains: [shared]
        other:
          contains: [shared]
        shared:
          parent: platform
          contains: [App]
    `);
    expect(m.zones.find((z) => z.id === "platform")?.resolvedContains).toContainEqual({ type: "zone", id: "shared" });
    expect(m.errors.some((e) => e.code === "zone_parent_conflict")).toBe(true);
  });

  it("detects zone nesting cycles", () => {
    const m = parse(`graph LR
      App[App]
      ---
      zones:
        a: { parent: b }
        b: { parent: a, contains: [App] }
    `);
    expect(m.errors.some((e) => e.code === "zone_cycle")).toBe(true);
  });

  it("warns when edge data and data flows disagree before normalization", () => {
    const m = parse(`graph LR
      Web[Web] --> API[API]
      API --> DB[(DB)]
      ---
      edges:
        Web->API: { data: session }
      data:
        session:
          flows: [API->DB]
    `);
    expect(m.warnings.some((w) => w.code === "data_flow_mismatch")).toBe(true);
  });

  it("uses placement.zone as a primary-zone inference when it references a known zone", () => {
    const m = parse(`graph LR
      App[App]
      ---
      nodes:
        App:
          placement:
            zone: private
      zones:
        private: { label: Private }
    `);
    const app = m.nodes.find((n) => n.id === "App")!;
    expect(app.resolvedZone).toBe("private");
    expect(app.zone).toBe("private");
    expect(app.inferred).toContain("zone");
  });

  it("distinguishes unknown child zones from unknown nodes in zone contains", () => {
    const m = parse(`graph LR
      App[App]
      ---
      zones:
        private:
          contains: [missing-vpc-zone, MissingNode]
    `);
    const codes = m.warnings.map((w) => w.code);
    expect(codes).toContain("zone_unknown_child_zone");
    expect(codes).toContain("zone_unknown_node");
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

  it("infers monitoring, logging, scan, and vpn hints from labels", () => {
    const m = parse(`graph LR
      A[a] -->|metrics export| B[b]
      B -->|logs| C[c]
      C -->|security scan| D[d]
      D -->|VPN tunnel| E[e]
    `);
    const byLabel = Object.fromEntries(m.edges.map((e) => [e.label, e]));
    expect(byLabel["metrics export"].flow).toBe("monitoring");
    expect(byLabel.logs.flow).toBe("logging");
    expect(byLabel["security scan"].flow).toBe("security_scan");
    expect(byLabel["VPN tunnel"].networkPath).toEqual(["vpn"]);
    expect(byLabel["VPN tunnel"].boundaryCrossing).toEqual({ crosses: [], reviewed: false });
    expect(m.infos.some((d) => d.code === "inferred_flow")).toBe(true);
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
    expect(codes).toContain("unknown_node_kind");
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

  it("accepts comprehensive sample vocabulary and token issue auth shape", () => {
    const m = parse(`graph LR
      FirebaseAuth[Firebase Auth] --> Web[Web]
      FirebaseAuth --> Mobile[Mobile]
      CloudRun[Cloud Run] --> GKECluster[GKE Cluster]
      CloudLogging[Cloud Logging] --> BigQuery[(BigQuery)]
      CloudRun --> TraceBackend[Trace Backend]
      VPCPeering[VPC Peering] --> CloudRun
      CloudRun --> TelemetrySink[Telemetry Sink]
      ---
      nodes:
        FirebaseAuth: { kind: identity_provider, layer: identity }
        Web: { kind: web_app, layer: client }
        Mobile: { kind: mobile_app, layer: client }
        CloudRun: { kind: serverless_service, layer: runtime }
        GKECluster: { kind: kubernetes_cluster, layer: runtime }
        CloudLogging: { kind: logging, layer: operations }
        BigQuery: { kind: data_warehouse, layer: data }
        TraceBackend: { kind: tracing, layer: operations }
        VPCPeering: { kind: vpc_peering, layer: network }
        TelemetrySink: { kind: monitoring, layer: operations }
      identities:
        admin-user: { kind: user, attachedTo: Web }
      edges:
        firebase_web_token_issue:
          from: FirebaseAuth
          to: Web
          flow: token_issue
          auth: { token: JWT, issuer: FirebaseAuth, recipient: Web }
        firebase_mobile_token_issue:
          from: FirebaseAuth
          to: Mobile
          flow: token_issue
          auth: { token: JWT, issuer: FirebaseAuth, recipient: Mobile }
        cloudlogging_bigquery_export:
          from: CloudLogging
          to: BigQuery
          flow: log_export
        cloudrun_trace_export:
          from: CloudRun
          to: TraceBackend
          flow: trace_export
        cloudrun_telemetry_export:
          from: CloudRun
          to: TelemetrySink
          flow: telemetry_export
    `);
    const messages = m.warnings.map((w) => `${w.code}: ${w.message}`);
    expect(messages.some((message) => message.includes("kubernetes_cluster"))).toBe(false);
    expect(messages.some((message) => message.includes("admin-user") && message.includes("unknown_identity_kind"))).toBe(false);
    expect(messages.some((message) => message.includes("firebase_web_token_issue") && message.includes("auth_token_without_validator"))).toBe(false);
    expect(messages.some((message) => message.includes("firebase_mobile_token_issue") && message.includes("auth_token_without_validator"))).toBe(false);
    expect(messages.some((message) => message.includes("log_export"))).toBe(false);
    expect(messages.some((message) => message.includes("trace_export"))).toBe(false);
    expect(messages.some((message) => message.includes("vpc_peering"))).toBe(false);
    expect(messages.some((message) => message.includes("telemetry_export"))).toBe(false);
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

  it("accepts node principals and typed permission resources", () => {
    const m = parse(`graph LR
      A[a]
      ---
      nodes:
        A: { principal: app-sa }
      zones:
        gcp: { kind: cloud }
      data:
        profile: { classification: personal, storedIn: [A] }
      permissions:
        p_zone:
          principal: app-sa
          action: deploy
          resource: { type: zone, id: gcp }
        p_data:
          principal: app-sa
          action: read
          resource: { type: data, id: profile }
    `);
    const codes = m.warnings.map((w) => w.code);
    expect(codes).not.toContain("permission_unknown_principal");
    expect(codes).not.toContain("permission_unknown_resource");
    expect(m.permissions[0].resource).toEqual({ type: "zone", id: "gcp" });
  });

  it("the example model is error-free", () => {
    const m = parse(example);
    expect(m.errors).toEqual([]);
  });

  it("derives combined diagnostics with spec-level fields", () => {
    const m = parse(`graph LR
      A[a]
      ---
      nodes:
        A: { kind: spaceship }
    `);
    const warning = m.warnings.find((d) => d.code === "unknown_node_kind")!;
    expect(warning.level).toBe("warning");
    expect(warning.target).toEqual({ type: "node", id: "A" });
    expect(m.diagnostics).toContain(warning);
    expect(m.suggestions.some((d) => d.code === "node_without_metadata")).toBe(false);
    expect(m.infos).toEqual([]);
  });

  it("places improvement diagnostics in suggestions", () => {
    const m = parse(`graph LR
      App[App] --> DB[(DB)]
      ---
      nodes:
        App:
          zone: private
          placement:
            dependency: missing-project
        DB:
          zone: private
      zones:
        private: { label: Private }
      data:
        session:
          flows: [App->DB]
    `);
    const codes = m.suggestions.map((d) => d.code);
    expect(codes).toContain("placement_ref_unknown");
    expect(codes).toContain("data_without_classification");
    expect(codes).toContain("dataflow_missing_storage");
    expect(m.warnings.map((d) => d.code)).not.toContain("data_without_classification");
  });

  it("validates auth references and flow-sensitive token metadata", () => {
    const m = parse(`graph LR
      IdP[IdP] --> API[API]
      API --> Web[Web]
      IdP --> Web
      ---
      edges:
        issue:
          from: IdP
          to: API
          flow: token_issue
          auth: { recipient: GhostUser }
        issue_missing_recipient:
          from: IdP
          to: Web
          flow: token_issue
          auth: { token: JWT, issuer: IdP }
        validate:
          from: API
          to: Web
          flow: token_validate
          auth: { token: JWT, issuer: GhostIdP, validatedBy: GhostAPI }
    `);
    const warningCodes = m.warnings.map((d) => d.code);
    const suggestionCodes = m.suggestions.map((d) => d.code);
    expect(warningCodes).toContain("auth_flow_without_token");
    expect(warningCodes).toContain("auth_token_without_issuer");
    expect(warningCodes).toContain("auth_unknown_issuer");
    expect(warningCodes).toContain("auth_unknown_validator");
    expect(warningCodes).toContain("auth_unknown_recipient");
    expect(suggestionCodes).toContain("auth_token_without_recipient");
  });

  it("validates boundary references and data classification vocabulary", () => {
    const m = parse(`graph LR
      App[App] --> Logs[Logs]
      ---
      zones:
        private:
          kind: magic_zone
      identities:
        app-id:
          kind: magic_identity
      boundaries:
        public_edge:
          kind: magic_boundary
          zone: missing-zone
          contains: [missing-boundary, missing-zone, MissingNode]
      edges:
        App->Logs: { flow: logging }
      data:
        event_log:
          classification: cosmic
          flows: [App->Logs]
          processedBy: [GhostProcessor]
    `);
    const warningCodes = m.warnings.map((d) => d.code);
    const suggestionCodes = m.suggestions.map((d) => d.code);
    expect(warningCodes).toContain("unknown_zone_kind");
    expect(warningCodes).toContain("unknown_identity_kind");
    expect(warningCodes).toContain("unknown_boundary_kind");
    expect(warningCodes).toContain("boundary_unknown_related_zone");
    expect(warningCodes).toContain("boundary_unknown_boundary");
    expect(warningCodes).toContain("boundary_unknown_zone");
    expect(warningCodes).toContain("boundary_unknown_node");
    expect(warningCodes).toContain("unknown_classification");
    expect(warningCodes).toContain("data_unknown_node");
    expect(suggestionCodes).toContain("dataflow_missing_storage");
  });

  it("detects boundary nesting cycles", () => {
    const m = parse(`graph LR
      App[App]
      ---
      boundaries:
        public_edge:
          contains: [private_edge]
        private_edge:
          contains: [public_edge]
    `);
    expect(m.errors.some((d) => d.code === "boundary_cycle")).toBe(true);
  });

  it("suggests telemetry data context when telemetry-like edges have no data object", () => {
    const m = parse(`graph LR
      App[App] -->|metrics| Monitor[Monitor]
    `);
    expect(m.suggestions.some((d) => d.code === "telemetry_without_data_classification")).toBe(true);
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
