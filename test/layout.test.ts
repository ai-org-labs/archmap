import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { computeLayout } from "../src/layout.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);
const comprehensive = readFileSync(
  fileURLToPath(new URL("fixtures/comprehensive.archmap", import.meta.url)),
  "utf8",
);
const coreArchitecture = readFileSync(
  fileURLToPath(new URL("fixtures/core-architecture.archmap", import.meta.url)),
  "utf8",
);
const localFirstUi = readFileSync(
  fileURLToPath(new URL("fixtures/local-first-ui.archmap", import.meta.url)),
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

function pointInsideNode(node: { shape: string; x: number; y: number; w: number; h: number }, point: { x: number; y: number }, pad = 0.75): boolean {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const rx = node.w / 2;
  const ry = node.h / 2;
  if (node.shape === "circle") return ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2 < 1 - pad / Math.max(rx, ry);
  if (node.shape === "diamond") return Math.abs(point.x - cx) / rx + Math.abs(point.y - cy) / ry < 1 - pad / Math.max(rx, ry);
  if (node.shape === "database") {
    const capRy = Math.min(10, node.h / 6);
    const topCy = node.y + capRy;
    const bottomCy = node.y + node.h - capRy;
    const inBody = point.x > node.x + pad && point.x < node.x + node.w - pad && point.y >= topCy && point.y <= bottomCy;
    const inTop = ((point.x - cx) / rx) ** 2 + ((point.y - topCy) / capRy) ** 2 < 1 - pad / Math.max(rx, capRy);
    const inBottom = ((point.x - cx) / rx) ** 2 + ((point.y - bottomCy) / capRy) ** 2 < 1 - pad / Math.max(rx, capRy);
    return inBody || inTop || inBottom;
  }
  return point.x > node.x + pad && point.x < node.x + node.w - pad && point.y > node.y + pad && point.y < node.y + node.h - pad;
}

function segmentSamples(a: { x: number; y: number }, b: { x: number; y: number }): Array<{ x: number; y: number }> {
  const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const steps = Math.max(2, Math.ceil(len / 6));
  return Array.from({ length: steps - 1 }, (_, i) => {
    const t = (i + 1) / steps;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

function segmentCoincidesWithNodeBorder(
  a: { x: number; y: number },
  b: { x: number; y: number },
  node: { x: number; y: number; w: number; h: number },
): boolean {
  const horizontal = Math.abs(a.y - b.y) < 0.5;
  const vertical = Math.abs(a.x - b.x) < 0.5;
  if (horizontal) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const overlap = Math.min(x1, node.x + node.w) - Math.max(x0, node.x);
    return overlap > 1 && (Math.abs(a.y - node.y) < 0.5 || Math.abs(a.y - (node.y + node.h)) < 0.5);
  }
  if (vertical) {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const overlap = Math.min(y1, node.y + node.h) - Math.max(y0, node.y);
    return overlap > 1 && (Math.abs(a.x - node.x) < 0.5 || Math.abs(a.x - (node.x + node.w)) < 0.5);
  }
  return false;
}

function closestRectSide(
  node: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
): "left" | "right" | "top" | "bottom" {
  return [
    { side: "left" as const, distance: Math.abs(point.x - node.x) },
    { side: "right" as const, distance: Math.abs(point.x - (node.x + node.w)) },
    { side: "top" as const, distance: Math.abs(point.y - node.y) },
    { side: "bottom" as const, distance: Math.abs(point.y - (node.y + node.h)) },
  ].sort((a, b) => a.distance - b.distance)[0].side;
}

function endpointLeavesFaceCleanly(
  node: { x: number; y: number; w: number; h: number },
  endpoint: { x: number; y: number },
  adjacent: { x: number; y: number },
): boolean {
  const side = closestRectSide(node, endpoint);
  const length = Math.abs(adjacent.x - endpoint.x) + Math.abs(adjacent.y - endpoint.y);
  if (length < 10) return false;
  if (side === "left") return Math.abs(adjacent.y - endpoint.y) < 0.5 && adjacent.x <= endpoint.x + 0.5;
  if (side === "right") return Math.abs(adjacent.y - endpoint.y) < 0.5 && adjacent.x >= endpoint.x - 0.5;
  if (side === "top") return Math.abs(adjacent.x - endpoint.x) < 0.5 && adjacent.y <= endpoint.y + 0.5;
  return Math.abs(adjacent.x - endpoint.x) < 0.5 && adjacent.y >= endpoint.y - 0.5;
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

  it("keeps short kind-only components compact instead of reserving unused icon space", () => {
    const layout = computeLayout(parse(localFirstUi));
    const user = layout.nodes.find((n) => n.id === "User")!;
    const tabs = layout.nodes.find((n) => n.id === "Tabs")!;
    expect(user.w).toBeLessThanOrEqual(60);
    expect(tabs.w).toBeLessThanOrEqual(116);
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

  it("wraps child zones inside parent zone boxes", () => {
    const m = parse(`graph LR
      App[App]
      DB[(DB)]
      ---
      nodes:
        App: { zone: cluster }
        DB: { zone: data }
      zones:
        cloud: { label: Cloud, contains: [project] }
        project: { label: Project, parent: cloud, contains: [cluster, data] }
        cluster: { label: GKE Cluster, parent: project, contains: [App] }
        data: { label: Data Services, parent: project, contains: [DB] }
    `);
    const layout = computeLayout(m);
    const cloud = layout.zones.find((z) => z.id === "cloud")!;
    const project = layout.zones.find((z) => z.id === "project")!;
    const cluster = layout.zones.find((z) => z.id === "cluster")!;
    const data = layout.zones.find((z) => z.id === "data")!;
    expect(cloud.depth).toBe(0);
    expect(project.depth).toBe(1);
    expect(cluster.depth).toBe(2);
    expect(data.depth).toBe(2);
    for (const child of [project, cluster, data]) {
      const parent = child.id === "project" ? cloud : project;
      expect(child.x).toBeGreaterThanOrEqual(parent.x);
      expect(child.y).toBeGreaterThanOrEqual(parent.y);
      expect(child.x + child.w).toBeLessThanOrEqual(parent.x + parent.w);
      expect(child.y + child.h).toBeLessThanOrEqual(parent.y + parent.h);
    }
    expect(cloud.nodeIds.sort()).toEqual(["App", "DB"]);
  });

  it("wraps nested boundaries around referenced zones and child boundaries", () => {
    const m = parse(`graph LR
      App[App]
      DB[(DB)]
      ---
      nodes:
        App: { zone: project }
        DB: { zone: project }
      zones:
        project: { label: Project, contains: [App, DB] }
      boundaries:
        data: { label: Data Boundary, kind: trust_boundary, contains: [DB] }
        network: { label: Network, kind: network_boundary, contains: [project, data] }
    `);
    const layout = computeLayout(m);
    const zone = layout.zones.find((z) => z.id === "project")!;
    const child = layout.boundaries.find((b) => b.id === "data")!;
    const boundary = layout.boundaries.find((b) => b.id === "network")!;
    expect(boundary.depth).toBe(0);
    expect(child.depth).toBe(1);
    expect(boundary.x).toBeLessThanOrEqual(zone.x);
    expect(boundary.y).toBeLessThanOrEqual(zone.y);
    expect(boundary.x + boundary.w).toBeGreaterThanOrEqual(zone.x + zone.w);
    expect(boundary.y + boundary.h).toBeGreaterThanOrEqual(zone.y + zone.h);
    expect(boundary.x).toBeLessThanOrEqual(child.x);
    expect(boundary.y).toBeLessThanOrEqual(child.y);
    expect(boundary.x + boundary.w).toBeGreaterThanOrEqual(child.x + child.w);
    expect(boundary.y + boundary.h).toBeGreaterThanOrEqual(child.y + child.h);
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

  it("keeps unobstructed ordinary routes to at most one bend", () => {
    const m = parse(`graph LR
      A[A] --> B[B]
      C[C] --> D[D]
      ---
      nodes:
        A: { zone: client }
        B: { zone: gcp }
        C: { zone: client }
        D: { zone: aws }
    `);
    const layout = computeLayout(m);
    for (const edge of layout.edges) {
      expect(edge.points.length).toBeLessThanOrEqual(3);
    }
  });

  it("chooses nearby side ports for shorter unobstructed routes", () => {
    const m = parse(`graph LR
      Source[Source] --> Target[Target]
      ---
      nodes:
        Source: { zone: gcp }
        Target: { zone: client }
      zones:
        client: { contains: [Target] }
        gcp: { contains: [Source] }
    `);
    const layout = computeLayout(m);
    const source = layout.nodes.find((n) => n.id === "Source")!;
    const target = layout.nodes.find((n) => n.id === "Target")!;
    const edge = layout.edges[0];
    const start = edge.points[0];
    const end = edge.points[edge.points.length - 1];
    const centerStartY = source.y + source.h / 2;
    const targetCenterY = target.y + target.h / 2;

    expect(start.x).toBeCloseTo(source.x + source.w, 1);
    expect(Math.abs(start.y - targetCenterY)).toBeLessThan(Math.abs(centerStartY - targetCenterY));
    expect(end.y).toBeCloseTo(target.y + target.h, 1);
    expect(edge.points.length).toBeLessThanOrEqual(3);
  });

  it("does not add detours only to avoid sharing endpoint axes", () => {
    const m = parse(`graph LR
      Home[Home] --> ProductList[Product List]
      Home --> Login[Login]
      Home --> Help[Help]
      ProductList --> ProductDetail[Product Detail]
      Login --> ProductDetail
      Help --> ProductDetail
    `);
    const layout = computeLayout(m);
    for (const edge of layout.edges) {
      expect(edge.points.length).toBeLessThanOrEqual(3);
    }
  });

  it("removes endpoint-preserving doglegs from the core architecture sample", () => {
    const m = parse(coreArchitecture);
    const layout = computeLayout(m);
    const layoutToRenderer = layout.edges.find((e) => e.id === "Layout__Renderer__0")!;

    expect(layoutToRenderer.points).toHaveLength(3);
    for (const edge of layout.edges) {
      expect(edge.points.length).toBeLessThanOrEqual(4);
    }
  });

  it("keeps local-first UI routes from turning back through endpoint components", () => {
    const m = parse(localFirstUi);
    const layout = computeLayout(m);

    for (const edge of layout.edges) {
      if (edge.points.length < 2) continue;
      const source = layout.nodes.find((n) => n.id === edge.from)!;
      const target = layout.nodes.find((n) => n.id === edge.to)!;
      if (source.shape === "rectangle") {
        expect(endpointLeavesFaceCleanly(source, edge.points[0], edge.points[1])).toBe(true);
      }
      if (target.shape === "rectangle") {
        expect(endpointLeavesFaceCleanly(target, edge.points[edge.points.length - 1], edge.points[edge.points.length - 2])).toBe(true);
      }
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

  it("keeps comprehensive sample edges out of node shapes", () => {
    const m = parse(comprehensive);
    const layout = computeLayout(m);
    for (const edge of layout.edges) {
      for (let i = 0; i < edge.points.length - 1; i++) {
        for (const sample of segmentSamples(edge.points[i], edge.points[i + 1])) {
          for (const node of layout.nodes) {
            if (node.id === edge.from || node.id === edge.to) continue;
            expect(pointInsideNode(node, sample)).toBe(false);
          }
        }
      }
    }
  });

  it("keeps comprehensive sample edges from running along node borders", () => {
    const m = parse(comprehensive);
    const layout = computeLayout(m);
    for (const edge of layout.edges) {
      for (let i = 0; i < edge.points.length - 1; i++) {
        for (const node of layout.nodes) {
          if (node.id === edge.from || node.id === edge.to) continue;
          expect(segmentCoincidesWithNodeBorder(edge.points[i], edge.points[i + 1], node)).toBe(false);
        }
      }
    }
  });

  it("expands the comprehensive sample canvas to contain routed edge geometry", () => {
    const m = parse(comprehensive);
    const layout = computeLayout(m);
    for (const edge of layout.edges) {
      for (const point of [...edge.points, edge.labelAt]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(layout.width);
        expect(point.y).toBeLessThanOrEqual(layout.height);
      }
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
