import { describe, expect, it } from "vitest";
import { analyzeTopology, parse, toCanonicalModel } from "../src/index.js";

const nativeSource = `
graph LR
---
topology:
  resources:
    client: { label: Client, kind: user, parent: null }
    api: { label: API, kind: runtime_service, parent: app_subnet }
    db: { label: DB, kind: relational_database, parent: data_subnet }
    partner: { label: Partner, kind: external_partner, parent: partner_systems }
  containers:
    cloud: { label: Cloud, kind: aws.account, roles: [administrative], parent: null }
    vpc: { label: VPC, kind: aws.vpc, roles: [network, security], parent: cloud, enforcedBy: [api] }
    app_subnet: { label: App, kind: aws.subnet, roles: [network], parent: vpc }
    data_subnet: { label: Data, kind: aws.subnet, roles: [network], parent: vpc }
    partner_systems: { label: Partners, roles: [administrative], parent: null }
  overlays:
    pci:
      roles: [security, compliance]
      render: outline
      members: [{ resource: api }, { resource: db }]
  edges:
    api_db: { from: api, to: db, protocol: TLS, port: 5432 }
    api_partner: { from: api, to: partner, direction: bidirectional, protocol: HTTPS, port: 443 }
`;

describe("native ArchMap Next topology DSL", () => {
  it("keeps authored topology facts and projects them to released renderers", () => {
    const model = parse(nativeSource);

    expect(model.errors).toEqual([]);
    expect(model.warnings.some(({ code }) => code === "plugin_required")).toBe(false);
    expect(model.warnings.some(({ code }) => code === "zone_crossing_without_boundary")).toBe(false);
    expect(model.topology?.resources.map(({ id }) => id)).toEqual(["client", "api", "db", "partner"]);
    expect(model.topology?.containers.find(({ id }) => id === "vpc")).toMatchObject({
      kind: "aws.vpc",
      roles: ["network", "security"],
      enforcedBy: ["api"],
    });
    expect(model.nodes.find(({ id }) => id === "db")?.shape).toBe("database");
    expect(model.zones.find(({ id }) => id === "app_subnet")?.parent).toBe("vpc");
    expect(model.boundaries.find(({ id }) => id === "pci")?.contains).toEqual(["api", "db"]);
    expect(toCanonicalModel(model).topology).toEqual(model.topology);
  });

  it("derives structural crossings and Overlay transitions from direct communication", () => {
    const topology = parse(nativeSource).topology!;
    const analysis = analyzeTopology(topology);

    expect(analysis.crossingsForEdge("api_db").map(({ boundaryId, direction }) => [boundaryId, direction])).toEqual([
      ["app_subnet", "exit"],
      ["data_subnet", "enter"],
    ]);
    expect(analysis.crossingsForEdge("api_partner", "forward").map(({ boundaryId, direction }) => [boundaryId, direction])).toEqual([
      ["app_subnet", "exit"],
      ["vpc", "exit"],
      ["cloud", "exit"],
      ["partner_systems", "enter"],
    ]);
    expect(analysis.crossingsForEdge("api_partner", "reverse").map(({ boundaryId, direction }) => [boundaryId, direction])).toEqual([
      ["partner_systems", "exit"],
      ["cloud", "enter"],
      ["vpc", "enter"],
      ["app_subnet", "enter"],
    ]);
    expect(analysis.overlayTransitionForEdge("api_partner")).toMatchObject({ lost: ["pci"], gained: [], shared: [] });
  });

  it("rejects authored derived output", () => {
    const model = parse(nativeSource.replace("  edges:\n", "  crossings: []\n  edges:\n"));
    expect(model.errors.some(({ code }) => code === "topology_derived_input_forbidden")).toBe(true);
  });

  it("rejects Container endpoints and unknown Resource endpoints", () => {
    const source = `
graph LR
---
topology:
  resources:
    api: { parent: app }
  containers:
    app: { roles: [network], parent: null }
  edges:
    invalid: { from: app, to: api }
`;
    const model = parse(source);
    expect(model.errors.some(({ code }) => code === "topology_edge_endpoint_unknown")).toBe(true);
  });

  it("diagnoses invalid enforcedBy references", () => {
    const source = `
graph LR
---
topology:
  resources:
    api: { parent: app }
  containers:
    app: { roles: [security], parent: null, enforcedBy: [missing] }
  edges: {}
`;
    const model = parse(source);
    expect(model.errors.some(({ code }) => code === "topology_enforcer_unknown")).toBe(true);
  });
});
