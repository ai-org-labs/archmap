import { beforeEach, describe, expect, it } from "vitest";
import { createArchMap, query, trace } from "../src/index.js";
import lifecycle, { queryLifecycle, traceLifecycle } from "../packages/lifecycle/src/index.js";

const source = `graph LR
  Login[Login]
---
requirements:
  REQ-1: { title: Sign in, type: functional, status: approved, owner: product }
  REQ-2: { title: Audit sign in, type: security, status: draft, owner: security }
acceptanceCriteria:
  AC-1: { requirement: REQ-1, statement: Home opens, status: approved }
tests:
  TEST-1: { title: Login e2e, type: end_to_end, status: passed }
  TEST-2: { title: Login audit, type: integration, status: planned }
evidence:
  EVD-1: { type: test_result, status: passed }
relations:
  - { from: REQ-1, to: AC-1, type: satisfies }
  - { from: REQ-1, to: Login, type: realized_by }
  - { from: Login, to: TEST-1, type: verified_by }
  - { from: AC-1, to: TEST-1, type: verified_by }
  - { from: AC-1, to: TEST-2, type: verified_by }
  - { from: TEST-1, to: EVD-1, type: evidenced_by }
  - { from: REQ-2, to: REQ-1, type: refines }
  - { from: REQ-1, to: REQ-2, type: related_to }`;

describe("generic query and lifecycle trace", () => {
  const archmap = createArchMap().use(lifecycle);
  const model = archmap.parse(source);

  beforeEach(() => {
    expect(model.errors).toEqual([]);
  });

  it("queries generic registered types and explicit IDs without lifecycle vocabulary in Core", () => {
    expect(query(model, { types: ["requirement"] }).map((element) => element.id)).toEqual(["REQ-1", "REQ-2"]);
    expect(query(model, { ids: ["Login", "EVD-1"] }).map((element) => element.id)).toEqual(["EVD-1", "Login"]);
  });

  it("filters lifecycle elements by status and owner", () => {
    expect(queryLifecycle(model, { types: ["requirement"], statuses: ["approved"], owners: ["product"] })
      .map((element) => element.id)).toEqual(["REQ-1"]);
  });

  it("traces Requirement through Architecture and Test to Evidence deterministically", () => {
    const first = trace(model, "REQ-1", { maxDepth: 3 });
    const second = trace(model, "REQ-1", { maxDepth: 3 });
    expect(first).toEqual(second);
    expect(first.paths).toContainEqual({
      elements: ["REQ-1", "Login", "TEST-1", "EVD-1"],
      relations: ["REQ-1__realized_by__Login__0", "Login__verified_by__TEST-1__0", "TEST-1__evidenced_by__EVD-1__0"],
    });
  });

  it("supports one-to-many paths, reverse traversal, relation filters, cycles, and depth limits", () => {
    expect(trace(model, "AC-1", { relationTypes: ["verified_by"], maxDepth: 1 }).paths
      .filter((path) => path.relations.length === 1).map((path) => path.elements[path.elements.length - 1])).toEqual(["TEST-1", "TEST-2"]);
    expect(trace(model, "EVD-1", { direction: "reverse", maxDepth: 2 }).elements.map((element) => element.id))
      .toEqual(expect.arrayContaining(["AC-1", "Login", "TEST-1"]));
    expect(trace(model, "REQ-1", { direction: "both", maxDepth: 8 }).paths.every((path) => new Set(path.elements).size === path.elements.length)).toBe(true);
    expect(trace(model, "REQ-1", { maxDepth: 1 }).paths.every((path) => path.relations.length <= 1)).toBe(true);
  });

  it("applies lifecycle filters without render or DOM state", () => {
    const result = traceLifecycle(model, "REQ-1", { types: ["requirement", "acceptanceCriterion"], statuses: ["approved"], maxDepth: 1 });
    expect(result.elements.map((element) => element.id)).toEqual(["AC-1", "REQ-1"]);
  });
});
