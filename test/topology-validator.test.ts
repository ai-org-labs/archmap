import { describe, expect, it } from "vitest";
import {
  createArchMap,
  type ArchMapPlugin,
  type Diagnostic,
  type TopologyModel,
  type TopologyValidatorContext,
} from "../src/index.js";

const topology: TopologyModel = {
  resources: [
    { id: "client", kind: "client", parent: null },
    { id: "api", kind: "gcp.cloud-run", parent: "project" },
    { id: "firewall", kind: "firewall", parent: "project" },
  ],
  containers: [{ id: "project", kind: "gcp.project", roles: ["administrative"], parent: null, enforcedBy: ["firewall"] }],
  overlays: [],
  edges: [{ id: "client-api", from: "client", to: "api", direction: "directed" }],
};

describe("topology validator plugins", () => {
  it("keeps provider-specific containment truth out of Core", () => {
    const archmap = createArchMap();
    const providerUnusualButStructural: TopologyModel = {
      resources: [{ id: "service", kind: "gcp.cloud-run", parent: "organization" }],
      containers: [{
        id: "organization",
        kind: "gcp.organization",
        roles: ["administrative"],
        parent: null,
      }],
      overlays: [],
      edges: [],
    };

    const result = archmap.validateTopology(providerUnusualButStructural);
    expect(result.analysis.diagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("receives canonical topology and deterministic derived analysis", () => {
    const archmap = createArchMap();
    let observed: TopologyValidatorContext | undefined;
    archmap.use({
      name: "provider-rules",
      version: "1.0.0",
      topologyValidators: [{
        name: "gcp-containment",
        validate(context) {
          observed = context;
          return [{
            severity: "warning",
            code: "gcp_containment_example",
            message: "Provider rule example.",
            target: { type: "container", id: "project" },
          }];
        },
      }],
    });

    const result = archmap.validateTopology(topology);
    expect(observed?.topology).toBe(topology);
    expect(observed?.analysis.crossingsForEdge("client-api")).toEqual([
      expect.objectContaining({ boundaryId: "project", direction: "enter" }),
    ]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "gcp_containment_example",
      target: { type: "container", id: "project" },
    }));
  });

  it("runs installed topology validators during instance parsing", () => {
    const archmap = createArchMap();
    archmap.use({
      name: "addressable-resource-rule",
      version: "1.0.0",
      topologyValidators: [{
        name: "resource-rule",
        validate: (): Diagnostic[] => [{
          severity: "info",
          level: "suggestion",
          code: "resource_policy_example",
          message: "Resource policy example.",
          target: { type: "resource", id: "A" },
        }],
      }],
    });
    const model = archmap.parse("graph LR\n  A[A] --> B[B]");
    expect(model.suggestions).toContainEqual(expect.objectContaining({
      code: "resource_policy_example",
      target: { type: "resource", id: "A" },
    }));
  });

  it("never invents enforcement hops when path context is absent", () => {
    const archmap = createArchMap();
    const seenPaths: Array<readonly string[] | undefined> = [];
    const plugin: ArchMapPlugin = {
      name: "enforcement-path-rule",
      version: "1.0.0",
      topologyValidators: [{
        name: "enforced-by-path",
        validate(context) {
          seenPaths.push(context.pathContext?.pathForEdge("client-api"));
        },
      }],
    };
    archmap.use(plugin);
    archmap.validateTopology(topology);
    archmap.validateTopology(topology, {
      paths: [{ edgeId: "client-api", resourceIds: ["client", "firewall", "api"] }],
    });
    expect(seenPaths).toEqual([undefined, ["client", "firewall", "api"]]);
  });

  it("isolates and removes topology validators with their plugin", () => {
    const left = createArchMap();
    const right = createArchMap();
    left.use({
      name: "temporary-topology",
      version: "1.0.0",
      topologyValidators: [{ name: "temporary-rule", validate: () => [] }],
    });
    expect(left.listTopologyValidators()).toEqual(["temporary-rule"]);
    expect(right.listTopologyValidators()).toEqual([]);
    expect(left.unuse("temporary-topology")).toBe(true);
    expect(left.listTopologyValidators()).toEqual([]);
  });
});
