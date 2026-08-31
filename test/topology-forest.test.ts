import { describe, expect, it } from "vitest";
import {
  analyzeContainerForest,
  normalizeTopology,
  parse,
  validateContainerLayout,
  type TopologyModel,
} from "../src/index.js";
import { computeTopologyLayout } from "../src/layout-topology.js";

function topology(containers: TopologyModel["containers"], resources: TopologyModel["resources"] = []): TopologyModel {
  return { resources, containers, overlays: [], edges: [] };
}

describe("Container forest proof", () => {
  it("supports multiple roots, parent:null, and stable root-first ancestor chains", () => {
    const forest = analyzeContainerForest(topology([
      { id: "project-a", roles: ["administrative"], parent: null },
      { id: "vpc-a", roles: ["network"], parent: "project-a" },
      { id: "subnet-a", roles: ["network"], parent: "vpc-a" },
      { id: "project-b", roles: ["administrative"], parent: null },
      { id: "vpc-b", roles: ["network"], parent: "project-b" },
    ], [
      { id: "external-user", parent: null },
      { id: "api", parent: "subnet-a" },
    ]));

    expect(forest.valid).toBe(true);
    expect(forest.roots).toEqual(["project-a", "project-b"]);
    expect(forest.children["project-a"]).toEqual(["vpc-a"]);
    expect(forest.ancestors["subnet-a"]).toEqual(["project-a", "vpc-a"]);
    expect(forest.ancestors["project-b"]).toEqual([]);
  });

  it("rejects unknown Container and Resource parents", () => {
    const forest = analyzeContainerForest(topology([
      { id: "vpc", roles: [], parent: "missing-project" },
    ], [
      { id: "api", parent: "missing-subnet" },
    ]));

    expect(forest.valid).toBe(false);
    expect(forest.diagnostics.map(({ code }) => code)).toEqual([
      "container_parent_unknown",
      "resource_parent_unknown",
    ]);
    expect(forest.ancestors.vpc).toEqual([]);
  });

  it("rejects cycles deterministically", () => {
    const forest = analyzeContainerForest(topology([
      { id: "a", roles: [], parent: "b" },
      { id: "b", roles: [], parent: "c" },
      { id: "c", roles: [], parent: "a" },
    ]));

    expect(forest.diagnostics).toContainEqual(expect.objectContaining({
      code: "container_parent_cycle",
      target: { type: "container", id: "a" },
      relatedIds: ["a", "b", "c", "a"],
    }));
    expect(forest.ancestors).toEqual({ a: [], b: [], c: [] });
  });

  it("rejects duplicate declarations and conflicting structural parents", () => {
    const duplicate = analyzeContainerForest(topology([
      { id: "vpc", roles: [], parent: null },
      { id: "vpc", roles: [], parent: null },
    ]));
    const conflicting = analyzeContainerForest(topology([
      { id: "project-a", roles: [], parent: null },
      { id: "project-b", roles: [], parent: null },
      { id: "vpc", roles: [], parent: "project-a" },
      { id: "vpc", roles: [], parent: "project-b" },
    ]));

    expect(duplicate.diagnostics[0].code).toBe("container_duplicate_id");
    expect(conflicting.diagnostics[0]).toMatchObject({
      code: "container_multiple_parents",
      target: { type: "container", id: "vpc" },
      relatedIds: ["project-a", "project-b"],
    });
  });

  it("accepts non-overlapping siblings and fully contained descendants", () => {
    const forest = analyzeContainerForest(topology([
      { id: "project-a", roles: [], parent: null },
      { id: "vpc-a", roles: [], parent: "project-a" },
      { id: "subnet-a", roles: [], parent: "vpc-a" },
      { id: "project-b", roles: [], parent: null },
    ]));
    const failures = validateContainerLayout(forest, [
      { id: "project-a", x: 0, y: 0, w: 400, h: 300 },
      { id: "vpc-a", x: 20, y: 20, w: 300, h: 220 },
      { id: "subnet-a", x: 40, y: 40, w: 120, h: 100 },
      { id: "project-b", x: 440, y: 0, w: 300, h: 300 },
    ], { minimumSiblingGap: 32 });

    expect(failures).toEqual([]);
  });

  it("reports sibling overlap, insufficient clearance, and escaped descendants", () => {
    const forest = analyzeContainerForest(topology([
      { id: "root-a", roles: [], parent: null },
      { id: "child-a", roles: [], parent: "root-a" },
      { id: "root-b", roles: [], parent: null },
      { id: "root-c", roles: [], parent: null },
    ]));
    const failures = validateContainerLayout(forest, [
      { id: "root-a", x: 0, y: 0, w: 100, h: 100 },
      { id: "child-a", x: 80, y: 20, w: 40, h: 40 },
      { id: "root-b", x: 90, y: 0, w: 100, h: 100 },
      { id: "root-c", x: 205, y: 0, w: 100, h: 100 },
    ], { minimumSiblingGap: 24 });

    expect(failures.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "container_sibling_overlap",
      "container_sibling_clearance",
      "container_descendant_outside_parent",
    ]));
  });

  it("proves nested Container invariants against rendered Topology geometry", () => {
    const model = parse(`graph LR
      A[A] --> B[B]
      C[C] --> D[D]
      X[External] --> A
      ---
      nodes:
        A: { zone: subnet-a }
        B: { zone: subnet-a }
        C: { zone: subnet-b }
        D: { zone: subnet-b }
        X: { zone: external }
      zones:
        project:
          contains: [vpc]
        vpc:
          contains: [subnet-a, subnet-b]
        subnet-a:
          contains: [A, B]
        subnet-b:
          contains: [C, D]
        external:
          contains: [X]
    `);
    const topology = normalizeTopology(model).topology;
    const forest = analyzeContainerForest(topology);
    const layout = computeTopologyLayout(model);
    const failures = validateContainerLayout(
      forest,
      layout.zones.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    );

    expect(forest.roots).toEqual(["project", "external"]);
    expect(forest.ancestors["subnet-a"]).toEqual(["project", "vpc"]);
    expect(failures).toEqual([]);
  });
});
