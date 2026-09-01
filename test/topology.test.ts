import { describe, expect, it } from "vitest";
import { parse } from "../src/parser-entry.js";
import {
  computeTopologyLayout,
  GOLDEN_RATIO,
  TOPOLOGY_NESTED_ZONE_GAP,
  TOPOLOGY_NESTED_ZONE_HEADER_GAP,
  TOPOLOGY_ZONE_CLEARANCE,
} from "../src/layout-topology.js";
import { listViews, render } from "../src/render.js";
import { validateRenderedSvgPorts } from "../src/render-validation.js";

const source = `graph LR
  Users[Users] --> Gateway[Gateway]
  subgraph RegionA
    Gateway --> AppA[App A]
    AppA --> DBA[(DB A)]
  end
  subgraph RegionB
    Gateway --> AppB[App B]
    AppB --> DBB[(DB B)]
  end
---
nodes:
  Users: { zone: external, kind: user }
  Gateway: { zone: edge, kind: api_gateway }
  AppA: { zone: region_a, kind: runtime_service }
  DBA: { zone: region_a, kind: relational_database }
  AppB: { zone: region_b, kind: runtime_service }
  DBB: { zone: region_b, kind: relational_database }
zones:
  external: { contains: [Users] }
  edge: { contains: [Gateway] }
  region_a: { contains: [AppA, DBA] }
  region_b: { contains: [AppB, DBB] }
layout:
  grid:
    aspect: golden
    placements:
      - target: { type: node, id: Users }
        row: 1
        column: 1
        columnSpan: 2
view:
  default:
    base: topology
    overlays: [subgraph, zone]
`;

const nestedTopologySource = `graph LR
---
topology:
  resources:
    edge: { label: Edge, parent: public_subnet }
    api: { label: API, parent: app_subnet }
    db: { label: DB, parent: data_subnet }
  containers:
    cloud: { label: Production Cloud, parent: null }
    vpc: { label: Production VPC, parent: cloud }
    public_subnet: { label: Public Subnet, parent: vpc }
    app_subnet: { label: Application Subnet, parent: vpc }
    data_subnet: { label: Data Subnet, parent: vpc }
  edges:
    edge_api: { from: edge, to: api }
    api_db: { from: api, to: db }
view:
  default:
    base: topology
    overlays: [zone]
`;

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

function clearance(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const horizontal = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const vertical = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(horizontal, vertical);
}

describe("Topology view", () => {
  it("registers as a built-in base view", () => {
    expect(listViews()).toContain("topology");
  });

  it("keeps the complete grid at the golden ratio", () => {
    const layout = computeTopologyLayout(parse(source));
    expect(layout.grid).toBeDefined();
    expect(layout.width / layout.height).toBeCloseTo(GOLDEN_RATIO, 10);
    expect(layout.grid!.cellWidth / layout.grid!.cellHeight).toBeCloseTo(GOLDEN_RATIO, 10);
    expect(layout.grid!.gapX / layout.grid!.gapY).toBeCloseTo(GOLDEN_RATIO, 10);
    expect(layout.grid!.paddingX / layout.grid!.paddingY).toBeCloseTo(GOLDEN_RATIO, 10);
  });

  it("keeps the rendered SVG canvas at the golden ratio", () => {
    const rendered = render(parse(source), { baseView: "topology", overlays: ["subgraph", "zone"] });
    const viewBox = rendered.svg!.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(viewBox).not.toBeNull();
    expect(Number(viewBox![1]) / Number(viewBox![2])).toBeCloseTo(GOLDEN_RATIO, 3);
  });

  it("produces deterministic placement and routing", () => {
    const model = parse(source);
    const first = computeTopologyLayout(model);
    const second = computeTopologyLayout(model);
    expect(second.grid!.placements).toEqual(first.grid!.placements);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
  });

  it("uses integer cell spans and avoids component overlap", () => {
    const layout = computeTopologyLayout(parse(source));
    const users = layout.grid!.placements.Users;
    expect(users.row).toBe(0);
    expect(users.column).toBe(0);
    expect(users.columnSpan).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) expect(overlaps(layout.nodes[i], layout.nodes[j])).toBe(false);
    }
  });

  it("wraps zone members and exposes aligned subgraph geometry", () => {
    const layout = computeTopologyLayout(parse(source));
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const zone of layout.zones) {
      for (const id of zone.nodeIds) {
        const node = nodes.get(id)!;
        expect(node.x).toBeGreaterThanOrEqual(zone.x);
        expect(node.y).toBeGreaterThanOrEqual(zone.y);
        expect(node.x + node.w).toBeLessThanOrEqual(zone.x + zone.w);
        expect(node.y + node.h).toBeLessThanOrEqual(zone.y + zone.h);
      }
    }
    expect(layout.grid!.subgraphs.map((group) => group.id)).toEqual(expect.arrayContaining(["RegionA", "RegionB"]));
    for (let i = 0; i < layout.zones.length; i++) {
      for (let j = i + 1; j < layout.zones.length; j++) {
        expect(overlaps(layout.zones[i], layout.zones[j])).toBe(false);
        expect(clearance(layout.zones[i], layout.zones[j])).toBeGreaterThanOrEqual(TOPOLOGY_ZONE_CLEARANCE);
      }
    }
  });

  it("reserves readable label and side margins for nested Container zones", () => {
    const layout = computeTopologyLayout(parse(nestedTopologySource));
    const zones = new Map(layout.zones.map((zone) => [zone.id, zone]));
    const assertNestedMargin = (parentId: string, childId: string) => {
      const parent = zones.get(parentId)!;
      const child = zones.get(childId)!;
      expect(child.x - parent.x).toBeGreaterThanOrEqual(TOPOLOGY_NESTED_ZONE_GAP - 1e-6);
      expect(parent.x + parent.w - (child.x + child.w)).toBeGreaterThanOrEqual(TOPOLOGY_NESTED_ZONE_GAP - 1e-6);
      expect(child.y - parent.y).toBeGreaterThanOrEqual(TOPOLOGY_NESTED_ZONE_HEADER_GAP - 1e-6);
      expect(parent.y + parent.h - (child.y + child.h)).toBeGreaterThanOrEqual(TOPOLOGY_NESTED_ZONE_GAP - 1e-6);
    };

    assertNestedMargin("cloud", "vpc");
    assertNestedMargin("vpc", "public_subnet");
    assertNestedMargin("vpc", "app_subnet");
    assertNestedMargin("vpc", "data_subnet");
  });

  it("renders transparent dashed subgraphs and stable geometry across overlay toggles", () => {
    const model = parse(source);
    const plain = render(model, { baseView: "topology", overlays: [] });
    const grouped = render(model, { baseView: "topology", overlays: ["subgraph", "zone"] });
    expect(plain.svg).toContain('class="archmap archmap-view-topology"');
    expect(grouped.svg).toContain(".archmap-subgraph-box { fill: none;");
    expect(grouped.svg).toContain("stroke-dasharray: 7 5");
    expect(grouped.svg).toMatch(/--archmap-zone-fill:rgba\(\d+,\d+,\d+,0\.3\)/);
    expect(grouped.svg).toMatch(/--archmap-zone-stroke:rgba\(\d+,\d+,\d+,0\.55\)/);
    expect(grouped.svg).toMatch(/<rect class="archmap-subgraph-box"[^>]*rx="0" ry="0"/);
    expect(grouped.layout.width).toBe(plain.layout.width);
    expect(grouped.layout.height).toBe(plain.layout.height);
    expect(grouped.layout.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(plain.layout.nodes.map(({ id, x, y }) => ({ id, x, y })));
  });

  it("keeps topology connectors component-safe with perpendicular endpoint incidence", () => {
    const rendered = render(parse(source), { baseView: "topology", overlays: ["subgraph", "zone"] });
    const failures = validateRenderedSvgPorts(rendered.svg!);
    expect(failures.filter((failure) => ["component-intersection", "endpoint-incidence", "exact-endpoint-overlap"].includes(failure.kind))).toEqual([]);
  });

  it("diagnoses invalid and overlapping explicit cell hints", () => {
    const model = parse(`graph LR
      A[A] --> B[B]
      ---
      layout:
        grid:
          placements:
            - target: { type: node, id: A }
              row: 1
              column: 1
            - target: { type: node, id: B }
              row: 1
              column: 1
            - target: { type: node, id: Missing }
              row: 0
              column: 2
    `);
    expect(model.errors.map((diagnostic) => diagnostic.code)).toContain("topology_grid_placement_overlap");
    expect(model.warnings.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["topology_grid_unknown_target", "topology_grid_invalid_placement"]));
  });
});
