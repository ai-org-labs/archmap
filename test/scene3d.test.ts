import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { computeLayout } from "../src/layout.js";
import { buildScene3D } from "../src/views3d/scene.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);

describe("buildScene3D", () => {
  const layout = computeLayout(parse(example));
  const scene = buildScene3D(layout, { layerHeight: 1.5 });
  const byId = Object.fromEntries(scene.nodes.map((n) => [n.id, n]));

  it("maps every layout node and edge", () => {
    expect(scene.nodes).toHaveLength(layout.nodes.length);
    expect(scene.edges.length).toBe(layout.edges.length);
    expect(scene.zones.length).toBe(layout.zones.length);
  });

  it("uses layer depth as height (Y)", () => {
    expect(byId.Web.y).toBe(0); // client => layer 0
    expect(byId.CloudSQL.y).toBeCloseTo(3 * 1.5); // data => layer 3
    expect(byId.CloudSQL.layer).toBe(3);
  });

  it("centers the ground plane on the origin", () => {
    const xs = scene.nodes.map((n) => n.x);
    const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
    // Centered layout => average X near zero (within scene scale).
    expect(Math.abs(avg)).toBeLessThan(5);
  });

  it("builds zones as volumes that enclose their members' heights", () => {
    const gcp = scene.zones.find((z) => z.id === "gcp")!;
    // GCP spans APIGW (edge=1) .. CloudSQL (data=3) => non-trivial height.
    expect(gcp.h).toBeGreaterThan(3 * 1.5 - 1.5);
    const members = ["APIGW", "GCPApp", "CloudSQL"].map((id) => byId[id]);
    for (const m of members) {
      expect(m.y).toBeGreaterThanOrEqual(gcp.y - gcp.h / 2);
      expect(m.y).toBeLessThanOrEqual(gcp.y + gcp.h / 2);
    }
  });

  it("anchors edge endpoints at node centers", () => {
    const e = scene.edges.find((x) => x.id === "web_api")!;
    expect(e.a).toEqual({ x: byId.Web.x, y: byId.Web.y, z: byId.Web.z });
    expect(e.b).toEqual({ x: byId.APIGW.x, y: byId.APIGW.y, z: byId.APIGW.z });
  });
});

describe("three-view mount behavior", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/views3d/three-view.ts", import.meta.url)),
    "utf8",
  );

  it("keeps 3D zone volumes behind the additive zone overlay", () => {
    expect(source).toContain('(ctx.options.overlays ?? []).includes("zone")');
    expect(source).toContain("Zones are Add info in 3D too");
  });

  it("renders a camera-synced 3-axis view cube without custom gizmo drag controls", () => {
    expect(source).toContain("archmap-view-axis");
    expect(source).toContain("updateViewCube");
    expect(source).toContain("cubeQuat.copy(camera.quaternion).invert()");
    expect(source).not.toContain("setFromSpherical");
    expect(source).not.toContain("setPointerCapture");
  });
});
