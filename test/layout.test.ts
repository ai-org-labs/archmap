import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { computeLayout } from "../src/layout.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);

describe("computeLayout", () => {
  it("positions every node and produces a non-empty canvas", () => {
    const m = parse(example);
    const layout = computeLayout(m);
    expect(layout.nodes).toHaveLength(m.nodes.length);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    for (const n of layout.nodes) {
      expect(n.w).toBeGreaterThan(0);
      expect(n.h).toBeGreaterThan(0);
    }
  });

  it("ranks topologically along the flow axis (LR => increasing x)", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      B --> C[c]
    `);
    const layout = computeLayout(m);
    const x = Object.fromEntries(layout.nodes.map((n) => [n.id, n.x]));
    expect(x.A).toBeLessThan(x.B);
    expect(x.B).toBeLessThan(x.C);
  });

  it("ranks along the y axis for TD", () => {
    const m = parse(`graph TD
      A[a] --> B[b]
    `);
    const layout = computeLayout(m);
    const y = Object.fromEntries(layout.nodes.map((n) => [n.id, n.y]));
    expect(y.A).toBeLessThan(y.B);
  });

  it("carries layer depth in z for 3D", () => {
    const m = parse(example);
    const layout = computeLayout(m);
    const z = Object.fromEntries(layout.nodes.map((n) => [n.id, n.z]));
    expect(z.Web).toBe(0); // client
    expect(z.CloudSQL).toBe(3); // data
    expect(layout.depth).toBeGreaterThan(1);
  });

  it("separates zones into disjoint cross-axis lanes (no overlap)", () => {
    const m = parse(example);
    const layout = computeLayout(m);
    const yRange = (ids: string[]) => {
      const ns = ids.map((id) => layout.nodes.find((n) => n.id === id)!);
      return [Math.min(...ns.map((n) => n.y)), Math.max(...ns.map((n) => n.y + n.h))];
    };
    const gcp = yRange(["APIGW", "GCPApp", "CloudSQL"]);
    const aws = yRange(["AWSApp", "RDS"]);
    // GCP and AWS lanes must not overlap on the cross axis.
    expect(gcp[1] <= aws[0] || aws[1] <= gcp[0]).toBe(true);
  });

  it("wraps zone members in a bounding box", () => {
    const m = parse(example);
    const layout = computeLayout(m);
    const gcp = layout.zones.find((z) => z.id === "gcp")!;
    const members = ["APIGW", "GCPApp", "CloudSQL"].map(
      (id) => layout.nodes.find((n) => n.id === id)!,
    );
    for (const mem of members) {
      expect(mem.x).toBeGreaterThanOrEqual(gcp.x);
      expect(mem.y).toBeGreaterThanOrEqual(gcp.y);
      expect(mem.x + mem.w).toBeLessThanOrEqual(gcp.x + gcp.w);
      expect(mem.y + mem.h).toBeLessThanOrEqual(gcp.y + gcp.h);
    }
  });

  it("reserves header space so zone labels do not overlap member nodes", () => {
    const m = parse(`graph LR
      A[Only Node]
      ---
      nodes:
        A: { zone: onprem }
      zones:
        onprem: { label: OnPremises, contains: [A] }
    `);
    const layout = computeLayout(m);
    const zone = layout.zones.find((z) => z.id === "onprem")!;
    const node = layout.nodes.find((n) => n.id === "A")!;
    expect(node.y - zone.y).toBeGreaterThanOrEqual(32);
  });

  it("clips edge endpoints to node borders (two points each)", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
    `);
    const layout = computeLayout(m);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].points).toHaveLength(2);
  });
});
