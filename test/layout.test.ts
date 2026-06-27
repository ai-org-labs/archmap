import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { computeLayout } from "../src/layout.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);

function labelBox(label: string, at: { x: number; y: number }, orient: "h" | "v" = "h") {
  const w = label.length * 6.5 + 8;
  const x0 = orient === "v" ? at.x - 2 : at.x - w / 2;
  return { x0, x1: x0 + w, y0: at.y - 9, y1: at.y + 9 };
}

function overlaps(a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }): boolean {
  return Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
}

function isAxisAligned(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
}

function isOnShapeBoundary(
  shape: string,
  node: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
): boolean {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const rx = node.w / 2;
  const ry = node.h / 2;
  if (shape === "circle") {
    const v = ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2;
    return Math.abs(v - 1) < 0.03;
  }
  if (shape === "diamond") {
    const v = Math.abs(point.x - cx) / rx + Math.abs(point.y - cy) / ry;
    return Math.abs(v - 1) < 0.03;
  }
  if (shape === "database") {
    const capRy = Math.min(10, node.h / 6);
    const topCy = node.y + capRy;
    const bottomCy = node.y + node.h - capRy;
    const onSide =
      (Math.abs(point.x - node.x) < 0.5 || Math.abs(point.x - (node.x + node.w)) < 0.5) &&
      point.y >= topCy - 0.5 &&
      point.y <= bottomCy + 0.5;
    const topCap = ((point.x - cx) / rx) ** 2 + ((point.y - topCy) / capRy) ** 2;
    const bottomCap = ((point.x - cx) / rx) ** 2 + ((point.y - bottomCy) / capRy) ** 2;
    return onSide || Math.abs(topCap - 1) < 0.04 || Math.abs(bottomCap - 1) < 0.04;
  }
  return false;
}

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

  it("expands high-degree components to give connection ports more room", () => {
    const m = parse(`graph LR
      Hub[Service] --> A[Service]
      Hub --> B[Service]
      Hub --> C[Service]
      Hub --> D[Service]
      Hub --> E[Service]
      Hub --> F[Service]
      Hub --> G[Service]
      Hub --> H[Service]
      ---
      nodes:
        Hub: { principal: hub-sa }
        A: {}
        B: {}
        C: {}
        D: {}
        E: {}
        F: {}
        G: {}
        H: {}
    `);
    const layout = computeLayout(m);
    const hub = layout.nodes.find((n) => n.id === "Hub")!;
    const leaf = layout.nodes.find((n) => n.id === "A")!;
    expect(hub.w).toBeGreaterThan(leaf.w);
    expect(hub.h).toBeGreaterThan(leaf.h);
  });

  it("keeps same-lane components visually separated", () => {
    const m = parse(`graph LR
      A[A]
      B[B]
      ---
      nodes:
        A: { zone: gcp }
        B: { zone: gcp }
      zones:
        gcp: { contains: [A, B] }
    `);
    const layout = computeLayout(m);
    const a = layout.nodes.find((n) => n.id === "A")!;
    const b = layout.nodes.find((n) => n.id === "B")!;
    const gap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    expect(gap).toBeGreaterThanOrEqual(72);
  });

  it("keeps ordinary routed edges to at most one bend", () => {
    const m = parse(example);
    const layout = computeLayout(m);
    for (const edge of layout.edges) {
      expect(edge.points.length).toBeLessThanOrEqual(3);
    }
  });

  it("places endpoints on non-rectangular node boundaries", () => {
    const m = parse(`graph LR
      App[App] --> Circle((Circle))
      App --> Diamond{Decision}
      App --> DB[(Database)]
    `);
    const layout = computeLayout(m);
    for (const id of ["Circle", "Diamond", "DB"]) {
      const node = layout.nodes.find((n) => n.id === id)!;
      const edge = layout.edges.find((e) => e.to === id)!;
      const end = edge.points[edge.points.length - 1];
      expect(isOnShapeBoundary(node.shape, node, end)).toBe(true);
    }
  });

  it("counts permission overlay relationships when sizing hub components", () => {
    const m = parse(`graph LR
      Principal[Service] --> Hub[Service]
      ---
      nodes:
        Principal: { principal: principal-sa }
        Hub: {}
      permissions:
        p1: { principal: principal-sa, action: a, resource: Hub }
        p2: { principal: principal-sa, action: b, resource: Hub }
        p3: { principal: principal-sa, action: c, resource: Hub }
        p4: { principal: principal-sa, action: d, resource: Hub }
        p5: { principal: principal-sa, action: e, resource: Hub }
        p6: { principal: principal-sa, action: f, resource: Hub }
    `);
    const layout = computeLayout(m);
    const hub = layout.nodes.find((n) => n.id === "Hub")!;
    const principal = layout.nodes.find((n) => n.id === "Principal")!;
    expect(hub.w).toBeGreaterThan(96);
    expect(hub.h).toBeGreaterThan(48);
    expect(principal.h).toBeGreaterThan(48);
  });

  it("routes high-degree component edges across multiple sides", () => {
    const m = parse(`graph LR
      North[North] --> Hub[Hub]
      South[South] --> Hub
      West[West] --> Hub
      Hub --> East[East]
      Hub --> Store[(Store)]
      Hub --> Ops[Ops]
      Hub --> Audit[Audit]
      ---
      nodes:
        North: { zone: client }
        South: { zone: operations }
        West: { zone: gcp }
        Hub: { zone: gcp, principal: hub-sa }
        East: { zone: aws }
        Store: { zone: gcp }
        Ops: { zone: operations }
        Audit: { zone: saas }
      zones:
        client: { contains: [North] }
        gcp: { contains: [West, Hub, Store] }
        aws: { contains: [East] }
        operations: { contains: [South, Ops] }
        saas: { contains: [Audit] }
    `);
    const layout = computeLayout(m, { rankBy: "zone" });
    const hub = layout.nodes.find((n) => n.id === "Hub")!;
    const touches = new Set<string>();
    for (const edge of layout.edges.filter((e) => e.from === "Hub" || e.to === "Hub")) {
      for (const point of [edge.points[0], edge.points[edge.points.length - 1]]) {
        if (Math.abs(point.x - hub.x) < 0.5) touches.add("left");
        if (Math.abs(point.x - (hub.x + hub.w)) < 0.5) touches.add("right");
        if (Math.abs(point.y - hub.y) < 0.5) touches.add("top");
        if (Math.abs(point.y - (hub.y + hub.h)) < 0.5) touches.add("bottom");
      }
    }
    expect(touches.size).toBeGreaterThanOrEqual(3);
    for (const edge of layout.edges.filter((e) => e.from === "Hub" || e.to === "Hub")) {
      for (let i = 0; i < edge.points.length - 1; i++) {
        expect(isAxisAligned(edge.points[i], edge.points[i + 1])).toBe(true);
      }
    }
  });

  it("keeps hub routes orthogonal while ports are not overcrowded", () => {
    const m = parse(`graph LR
      A[A] --> Hub[Hub]
      Hub --> B[B]
      C[C] --> Hub
      Hub --> D[D]
      Hub --> E[E]
      Hub --> F[F]
      ---
      nodes:
        A: { zone: client }
        B: { zone: aws }
        C: { zone: gcp }
        D: { zone: operations }
        E: { zone: saas }
        F: { zone: onprem }
        Hub: { zone: gcp }
      zones:
        client: { contains: [A] }
        aws: { contains: [B] }
        gcp: { contains: [C, Hub] }
        operations: { contains: [D] }
        saas: { contains: [E] }
        onprem: { contains: [F] }
    `);
    const layout = computeLayout(m, { rankBy: "zone" });
    for (const edge of layout.edges.filter((e) => e.from === "Hub" || e.to === "Hub")) {
      for (let i = 0; i < edge.points.length - 1; i++) {
        expect(isAxisAligned(edge.points[i], edge.points[i + 1])).toBe(true);
      }
    }
  });

  it("keeps edge labels off node boxes and other edge labels", () => {
    const m = parse(example);
    const layout = computeLayout(m);
    const nodeBoxes = layout.nodes.map((n) => ({ x0: n.x - 2, x1: n.x + n.w + 2, y0: n.y - 2, y1: n.y + n.h + 2 }));
    const labels = layout.edges
      .filter((e) => e.label)
      .map((e) => labelBox(e.label!, e.labelAt, e.labelOrient));
    for (const label of labels) {
      expect(nodeBoxes.some((node) => overlaps(label, node))).toBe(false);
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(overlaps(labels[i], labels[j])).toBe(false);
      }
    }
  });

  it("routes reciprocal component edges on separate outside tracks", () => {
    const m = parse(`graph LR
      EndUser((End User)) --> Web[Web App]
      Web --> FirebaseAuth[Firebase Auth]
      FirebaseAuth --> Web
    `);
    const layout = computeLayout(m);
    const web = layout.nodes.find((n) => n.id === "Web")!;
    const auth = layout.nodes.find((n) => n.id === "FirebaseAuth")!;
    const toAuth = layout.edges.find((e) => e.from === "Web" && e.to === "FirebaseAuth")!;
    const toWeb = layout.edges.find((e) => e.from === "FirebaseAuth" && e.to === "Web")!;

    expect(toAuth.points).not.toEqual(toWeb.points);
    const webTouchY = toAuth.points[0].x >= web.x && toAuth.points[0].x <= web.x + web.w ? toAuth.points[0].y : toAuth.points[toAuth.points.length - 1].y;
    const webReturnTouchY = toWeb.points[0].x >= web.x && toWeb.points[0].x <= web.x + web.w ? toWeb.points[0].y : toWeb.points[toWeb.points.length - 1].y;
    const authTouchY = toAuth.points[0].x >= auth.x && toAuth.points[0].x <= auth.x + auth.w ? toAuth.points[0].y : toAuth.points[toAuth.points.length - 1].y;
    const authReturnTouchY = toWeb.points[0].x >= auth.x && toWeb.points[0].x <= auth.x + auth.w ? toWeb.points[0].y : toWeb.points[toWeb.points.length - 1].y;

    expect(Math.abs(webTouchY - webReturnTouchY)).toBeGreaterThan(1);
    expect(Math.abs(authTouchY - authReturnTouchY)).toBeGreaterThan(1);
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
