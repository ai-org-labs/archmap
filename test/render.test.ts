import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import {
  diagnosticsHtml,
  fetchArchMapSource,
  parseOverlaysAttribute,
  render,
  renderDiagnostics,
  registerView,
  listViews,
  viewerOptionsFromAttributes,
} from "../src/render.js";
import { renderInspector } from "../src/inspector.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);
const comprehensive = readFileSync(
  fileURLToPath(new URL("fixtures/comprehensive.archmap", import.meta.url)),
  "utf8",
);
const nestedZones = readFileSync(
  fileURLToPath(new URL("../examples/nested-zones.archmap", import.meta.url)),
  "utf8",
);
const androidDriverStack = readFileSync(
  fileURLToPath(new URL("fixtures/pattern-samples/06-android-framework-driver-bt-devices.archmap", import.meta.url)),
  "utf8",
);

function textBoxes(svg: string, className: string): Array<{ x0: number; x1: number; y0: number; y1: number }> {
  return [...svg.matchAll(new RegExp(`<text class="${className}" x="([0-9.]+)" y="([0-9.]+)">([^<]+)</text>`, "g"))].map((m) => {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const text = m[3];
    return { x0: x - 2, x1: x + text.length * 6.8 + 6, y0: y - 12, y1: y + 4 };
  });
}

function overlaps(a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }): boolean {
  return Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
}

function nodeBoxes(svg: string): Array<{ id: string; x0: number; x1: number; y0: number; y1: number }> {
  return [...svg.matchAll(/<g class="archmap-node [^"]+" data-id="([^"]+)"[^>]*data-x="([0-9.]+)" data-y="([0-9.]+)" data-w="([0-9.]+)" data-h="([0-9.]+)"/g)].map((match) => {
    const x = Number(match[2]);
    const y = Number(match[3]);
    const w = Number(match[4]);
    const h = Number(match[5]);
    return [{ id: match[1], x0: x, x1: x + w, y0: y, y1: y + h }];
  }).flat();
}

function areaBoxes(svg: string, groupClass: string, boxClass: string): Array<{ id: string; x0: number; x1: number; y0: number; y1: number }> {
  return [...svg.matchAll(new RegExp(`<g class="${groupClass} [^"]+" data-id="([^"]+)"[\\s\\S]*?<rect class="${boxClass}" x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"`, "g"))].map((match) => {
    const x = Number(match[2]);
    const y = Number(match[3]);
    const w = Number(match[4]);
    const h = Number(match[5]);
    return { id: match[1], x0: x, x1: x + w, y0: y, y1: y + h };
  });
}

describe("render", () => {
  it("registers the overview view by default", () => {
    expect(listViews()).toContain("overview");
    expect(listViews()).toContain("layer");
  });

  it("renders an SVG string for the overview view", () => {
    const m = parse(example);
    const { svg, view } = render(m, { view: "overview" });
    expect(view).toBe("overview");
    expect(svg).toBeDefined();
    expect(svg!.startsWith("<svg")).toBe(true);
    expect(svg).toContain('class="archmap archmap-view-overview"');
    // Node ids and an edge label should be present.
    expect(svg).toContain('data-id="CloudSQL"');
    expect(svg).toContain("HTTPS + JWT");
    // Overview is structural until zone is added as information.
    expect(svg).not.toContain('class="archmap-zone archmap-zone-depth-');
  });

  it("tints overview nodes and outgoing edges by zone", () => {
    const m = parse(example);
    const { svg } = render(m, { view: "overview" });
    expect(svg).toContain('data-id="GCPApp" style="--archmap-node-fill:#fff4e8;--archmap-node-stroke:#d17732;--archmap-node-label:#7a3f12"');
    expect(svg).toContain('data-id="gcp_db" data-from="GCPApp" data-to="CloudSQL" style="--archmap-edge-stroke:#d17732;--archmap-edge-label:#7a3f12"');

    const overlaid = render(m, { baseView: "overview", overlays: ["zone"] }).svg!;
    expect(overlaid).toContain('data-id="gcp" data-depth="0" style="--archmap-zone-fill:#fff4e8;--archmap-zone-stroke:#d17732;--archmap-zone-label:#7a3f12"');
  });

  it("fills database cylinder tops with the node fill color", () => {
    const m = parse(example);
    const { svg } = render(m, { view: "overview" });
    expect(svg).toContain('class="archmap-node-shape-top-fill"');
    expect(svg).toContain(".archmap-node-shape-top-fill { fill: var(--archmap-node-fill");
  });

  it("collapses subgraphs into abstraction components and deduplicates external edges", () => {
    const m = parse(`graph LR
      subgraph Service
        A[API]
        B[Worker]
      end
      A --> D[Database]
      B --> D
      A --> E[Queue]
    `);
    const { svg, model } = render(m, { baseView: "overview", abstractionLevel: 1 });
    expect(model.nodes.map((node) => node.id).sort()).toEqual(["D", "E", "Service"]);
    expect(model.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["Service->D", "Service->E"]);
    expect(svg).toContain('class="archmap-node archmap-shape-rectangle archmap-node-abstraction');
    expect(svg).toContain('data-id="Service" data-abstraction-target="subgraph" data-abstraction-id="Service" data-abstraction-key="subgraph:Service"');
    expect(svg).not.toContain('data-id="A"');
    expect(svg).not.toContain('data-id="B"');
  });

  it("can expand one collapsed subgraph while keeping sibling abstractions collapsed", () => {
    const m = parse(`graph LR
      subgraph ServiceA
        A[API]
      end
      subgraph ServiceB
        B[Worker]
      end
      A --> D[Database]
      B --> D
    `);
    const model = render(m, { baseView: "overview", abstractionLevel: 1, expandedAbstractions: ["subgraph:ServiceA"] }).model;
    expect(model.nodes.map((node) => node.id).sort()).toEqual(["A", "D", "ServiceB"]);
    expect(model.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["A->D", "ServiceB->D"]);
  });

  it("uses subgraph depth as the abstraction slider level", () => {
    const m = parse(`graph LR
      subgraph System
        subgraph Runtime
          A[API]
        end
        B[CLI]
      end
      A --> D[Database]
      B --> E[Queue]
    `);
    const levelOne = render(m, { baseView: "overview", abstractionLevel: 1 }).model;
    expect(levelOne.nodes.map((node) => node.id).sort()).toEqual(["D", "E", "System"]);
    expect(levelOne.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["System->D", "System->E"]);

    const levelTwo = render(m, { baseView: "overview", abstractionLevel: 2 }).model;
    expect(levelTwo.nodes.map((node) => node.id).sort()).toEqual(["B", "D", "E", "Runtime"]);
    expect(levelTwo.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["B->E", "Runtime->D"]);
  });

  it("collapses zones into abstraction components and deduplicates external edges", () => {
    const m = parse(`graph LR
      A[API] --> D[Database]
      B[Worker] --> D
      A --> E[Queue]
      ---
      zones:
        service:
          label: Service Zone
          contains: [A, B]
    `);
    const { svg, model } = render(m, { baseView: "overview", abstractionTarget: "zone", abstractionLevel: 1 });
    expect(model.nodes.map((node) => node.id).sort()).toEqual(["D", "E", "service"]);
    expect(model.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["service->D", "service->E"]);
    expect(model.zones.map((zone) => zone.id)).toContain("service");
    expect(svg).toContain('data-id="service" data-abstraction-target="zone" data-abstraction-id="service" data-abstraction-key="zone:service"');
    expect(svg).not.toContain('data-id="A"');
    expect(svg).not.toContain('data-id="B"');
  });

  it("can expand one collapsed zone while keeping sibling zones collapsed", () => {
    const m = parse(`graph LR
      A[API] --> D[Database]
      B[Worker] --> D
      ---
      zones:
        service_a:
          contains: [A]
        service_b:
          contains: [B]
    `);
    const model = render(m, {
      baseView: "overview",
      abstractionTarget: "zone",
      abstractionLevel: 1,
      expandedAbstractions: ["zone:service_a"],
    }).model;
    expect(model.nodes.map((node) => node.id).sort()).toEqual(["A", "D", "service_b"]);
    expect(model.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["A->D", "service_b->D"]);
  });

  it("collapses and reopens zones by explicit interaction keys without the abstraction slider", () => {
    const m = parse(`graph LR
      A[API] --> D[Database]
      B[Worker] --> D
      ---
      zones:
        service:
          label: Service Zone
          contains: [A, B]
    `);
    const collapsed = render(m, {
      baseView: "overview",
      overlays: ["zone"],
      collapsedAbstractions: ["zone:service"],
    }).model;
    expect(collapsed.nodes.map((node) => node.id).sort()).toEqual(["D", "service"]);
    expect(collapsed.zones.map((zone) => zone.id)).toContain("service");

    const collapsedSvg = render(m, {
      baseView: "overview",
      overlays: ["zone"],
      collapsedAbstractions: ["zone:service"],
    }).svg!;
    expect(collapsedSvg).toContain('data-id="service" data-abstraction-target="zone" data-abstraction-id="service" data-abstraction-key="zone:service" style="--archmap-node-fill:#eef5ff;--archmap-node-stroke:#4f7fc8;--archmap-node-label:#244b86"');
    expect(collapsedSvg).toContain('data-id="service__D__abstract" data-from="service" data-to="D" style="--archmap-edge-stroke:#4f7fc8;--archmap-edge-label:#244b86"');
    expect(collapsedSvg).not.toContain('class="archmap-zone archmap-zone-depth-0" data-id="service"');

    const reopened = render(m, {
      baseView: "overview",
      overlays: ["zone"],
      collapsedAbstractions: ["zone:service"],
      expandedAbstractions: ["zone:service"],
    }).model;
    expect(reopened.nodes.map((node) => node.id).sort()).toEqual(["A", "B", "D"]);
    expect(reopened.zones.map((zone) => zone.id)).toContain("service");
  });

  it("uses nested zone depth for zone abstraction", () => {
    const m = parse(`graph LR
      A[API] --> D[Database]
      B[Worker] --> E[Queue]
      ---
      zones:
        platform:
          contains: [zone:service, B]
        service:
          parent: platform
          contains: [A]
    `);
    const levelOne = render(m, { baseView: "overview", abstractionTarget: "zone", abstractionLevel: 1 }).model;
    expect(levelOne.nodes.map((node) => node.id).sort()).toEqual(["D", "E", "platform"]);
    expect(levelOne.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["platform->D", "platform->E"]);

    const levelTwo = render(m, { baseView: "overview", abstractionTarget: "zone", abstractionLevel: 2 }).model;
    expect(levelTwo.nodes.map((node) => node.id).sort()).toEqual(["B", "D", "E", "service"]);
    expect(levelTwo.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["B->E", "service->D"]);
    expect(levelTwo.zones.find((zone) => zone.id === "platform")?.resolvedContains).toContainEqual({ type: "node", id: "service" });
  });

  it("marks edge startpoints with small dots", () => {
    const m = parse(`graph LR
      A[A] --> B[B]
    `);
    const { svg } = render(m, { view: "overview" });
    expect(svg).toContain('class="archmap-edge-startpoint"');
    expect(svg).toContain(".archmap-edge-startpoint { fill: var(--archmap-edge-stroke");
    expect(svg).toContain(".archmap-edge-startpoint { fill: var(--archmap-edge-stroke, #5b6b86); stroke: none; }");
    expect(svg).toContain(".archmap-emphasis .archmap-edge-startpoint { fill: var(--archmap-emphasis");
    expect(svg).toContain(".archmap-overlay-edge .archmap-edge-startpoint { fill: var(--archmap-permission");
  });

  it("keeps comprehensive sample zone and boundary labels from overlapping", () => {
    const m = parse(comprehensive);
    for (const baseView of ["overview", "layer"] as const) {
      const svg = render(m, { baseView, overlays: ["zone", "boundary"] }).svg!;
      const labels = [...textBoxes(svg, "archmap-zone-label"), ...textBoxes(svg, "archmap-boundary-label")];
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          expect(overlaps(labels[i], labels[j])).toBe(false);
        }
      }
    }
  });

  it("keeps zone labels from overlapping nodes", () => {
    const m = parse(nestedZones);
    const svg = render(m, { baseView: "overview", overlays: ["zone", "boundary"] }).svg!;
    const labels = [...textBoxes(svg, "archmap-zone-label"), ...textBoxes(svg, "archmap-boundary-label")];
    const nodes = nodeBoxes(svg);
    for (const label of labels) {
      for (const node of nodes) {
        expect(overlaps(label, node)).toBe(false);
      }
    }
  });

  it("packs stack-view zone blocks without overlapping each other", () => {
    const m = parse(example);
    const svg = render(m, { baseView: "layer", overlays: ["zone"] }).svg!;
    const plainSvg = render(parse(example), { baseView: "layer" }).svg!;
    expect(svg.match(/viewBox="([^"]+)"/)?.[1]).toBe(plainSvg.match(/viewBox="([^"]+)"/)?.[1]);
    expect(svg.match(/width="([^"]+)"/)?.[1]).toBe(plainSvg.match(/width="([^"]+)"/)?.[1]);
    expect(svg.match(/height="([^"]+)"/)?.[1]).toBe(plainSvg.match(/height="([^"]+)"/)?.[1]);
    const zones = areaBoxes(svg, "archmap-zone", "archmap-zone-box");
    const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
    const nodesById = new Map(nodeBoxes(svg).map((node) => [node.id, node]));
    expect(zones.length).toBeGreaterThan(1);
    expect(Math.min(...zones.map((zone) => zone.x0))).toBeLessThanOrEqual(50);
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        expect(overlaps(zones[i], zones[j])).toBe(false);
      }
    }
    for (const node of m.nodes) {
      if (!node.zone) continue;
      const zone = zonesById.get(node.zone);
      const renderedNode = nodesById.get(node.id);
      if (!zone || !renderedNode) continue;
      expect(renderedNode.x0).toBeGreaterThanOrEqual(zone.x0);
      expect(renderedNode.x1).toBeLessThanOrEqual(zone.x1);
      expect(renderedNode.y0).toBeGreaterThanOrEqual(zone.y0);
      expect(renderedNode.y1).toBeLessThanOrEqual(zone.y1);
    }
  });

  it("draws zone and boundary containers as solid area panels", () => {
    const m = parse(example);
    const svg = render(m, { baseView: "overview", overlays: ["zone", "boundary"] }).svg!;
    const style = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(style).toContain(".archmap-zone-box { fill:");
    expect(style).toContain(".archmap-boundary-box { fill:");
    expect(style.match(/\.archmap-zone-box \{[^}]*stroke-dasharray/)).toBeNull();
    expect(style.match(/\.archmap-boundary-box \{[^}]*stroke-dasharray/)).toBeNull();
    expect(svg).toContain('rx="14" ry="14"');
  });

  it("marks nested zone depth for styling", () => {
    const m = parse(`graph LR
      App[App]
      ---
      nodes:
        App: { zone: cluster }
      zones:
        cloud: { label: Cloud, contains: [project] }
        project: { label: Project, parent: cloud, contains: [cluster] }
        cluster: { label: Cluster, parent: project, contains: [App] }
    `);
    const svg = render(m, { baseView: "overview", overlays: ["zone"] }).svg!;
    expect(svg).toContain('data-id="cloud" data-depth="0"');
    expect(svg).toContain('data-id="project" data-depth="1"');
    expect(svg).toContain('data-id="cluster" data-depth="2"');
    expect(svg).toContain(".archmap-zone-depth-2 .archmap-zone-box");
  });

  it("renders the nested-zones example with zone and boundary layers", () => {
    const m = parse(nestedZones);
    const svg = render(m, { baseView: "overview", overlays: ["zone", "boundary"] }).svg!;
    expect(m.errors).toHaveLength(0);
    expect(svg).toContain("Google Cloud");
    expect(svg).toContain("VPC");
    expect(svg).toContain("us-west1 / GKE Standard");
    expect(svg).toContain('data-id="google_cloud" data-depth="0"');
    expect(svg).toContain('data-id="vpc" data-depth="1"');
    expect(svg).toContain('data-id="us_west1" data-depth="2"');
    expect(svg).toContain("Multi-cluster Service frontend");
  });

  it("marks the selected model element in the SVG", () => {
    const m = parse(example);
    const nodeSvg = render(m, { baseView: "overview", selection: { type: "node", id: "GCPApp" } }).svg!;
    expect(nodeSvg).toContain('class="archmap-node archmap-shape-rectangle archmap-selected" data-id="GCPApp"');

    const edgeSvg = render(m, { baseView: "overview", selection: { type: "edge", id: "web_api" } }).svg!;
    expect(edgeSvg).toContain('class="archmap-edge archmap-selected" data-id="web_api"');

    const zoneSvg = render(m, { baseView: "overview", overlays: ["zone"], selection: { type: "zone", id: "gcp" } }).svg!;
    expect(zoneSvg).toContain('class="archmap-zone archmap-zone-depth-0 archmap-selected" data-id="gcp"');
  });

  it("marks diagnostic targets in the SVG", () => {
    const m = parse(`graph LR
      A[A]
      ---
      nodes:
        A: { kind: made_up_kind }
    `);
    const diagnosticIndex = m.diagnostics.findIndex((d) => d.code === "unknown_node_kind");
    expect(diagnosticIndex).toBeGreaterThanOrEqual(0);
    const svg = render(m, { baseView: "overview", selection: { type: "diagnostic", id: String(diagnosticIndex) } }).svg!;
    expect(svg).toContain('class="archmap-node archmap-shape-rectangle archmap-selected" data-id="A"');
  });

  it("supports the baseView plus overlays API", () => {
    const m = parse(example);
    const { svg, view } = render(m, { baseView: "overview", overlays: ["auth", "dataflow"] });
    expect(view).toBe("overview");
    expect(svg).toContain('data-overlays="auth dataflow"');
    expect(svg).toContain("archmap-overlay-auth");
    expect(svg).toContain("archmap-overlay-dataflow");
    expect(svg).toContain('class="archmap-edge archmap-emphasis" data-id="web_api"');
    expect(svg).toContain(">JWT<");
    expect(svg).toContain("archmap-auth-badge");
    expect(svg).toContain("archmap-auth-edge-badge");
    expect(svg).toContain("archmap-data-edge-badge");
    expect(svg).not.toContain("JWT · issuer FirebaseAuth · validator APIGW");
    expect(svg).toContain(">JWT</text>");
    expect(svg).toContain(">customer_profile</text>");
    expect(svg).toContain("archmap-badge-tooltip");
    expect(svg).toContain("issuer: FirebaseAuth");
    expect(svg).toContain("validator: APIGW");
    expect(svg).toContain(".archmap-emphasis .archmap-edge-path { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 1.8; }");
  });

  it("keeps overview structural until information layers are added", () => {
    const m = parse(example);
    const plain = render(m, { baseView: "overview" });
    expect(plain.svg).toContain("archmap-view-overview");
    expect(plain.svg).not.toContain("data-overlays=");
    expect(plain.svg).not.toContain("archmap-overlay-auth");
    expect(plain.svg).not.toContain('class="archmap-subgraph archmap-subgraph-depth-');
    expect(plain.svg).not.toContain('class="archmap-zone archmap-zone-depth-');
    expect(plain.svg).not.toContain('class="archmap-boundary archmap-boundary-depth-');

    plain.addOverlay("auth");
    expect(plain.svg).toContain('data-overlays="auth"');
    expect(plain.svg).toContain("archmap-overlay-auth");

    plain.addOverlay("dataflow");
    expect(plain.svg).toContain('data-overlays="auth dataflow"');
    expect(plain.svg).toContain("archmap-overlay-dataflow");

    plain.removeOverlay("auth");
    expect(plain.svg).toContain('data-overlays="dataflow"');
    expect(plain.svg).not.toContain("archmap-overlay-auth");
  });

  it("supports layer as a semantic 2D view", () => {
    const m = parse(example);
    const { svg, view, layout } = render(m, { baseView: "layer" });
    expect(view).toBe("layer");
    expect(svg).toContain("archmap-view-layer");
    expect(new Set(layout.nodes.map((n) => n.z)).size).toBeGreaterThan(1);
  });

  it("renders Android platform stacks as fixed layer bands", () => {
    const m = parse(androidDriverStack);
    const { svg } = render(m, { baseView: "layer" });
    expect(svg).toBeDefined();
    const layerSvg = svg!;
    expect(layerSvg).toContain('class="archmap-layer archmap-layer-depth-0" data-id="applications"');
    expect(layerSvg).not.toContain('class="archmap-subgraph archmap-subgraph-depth-0" data-id="Device_A_App"');
    expect(layerSvg).toContain(">Applications<");
    expect(layerSvg).toContain(">Application Framework<");
    expect(layerSvg).toContain(">Libraries (user space)<");
    expect(layerSvg).toContain(">Linux Kernel<");
    expect(layerSvg).toContain(">Baseband<");

    const heights = [...layerSvg.matchAll(/<rect class="archmap-layer-box" x="[0-9.]+" y="[0-9.]+" width="[0-9.]+" height="([0-9.]+)"/g)]
      .map((match) => Number(match[1]));
    expect(heights.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  });

  it("shows zone and boundary area overlays only when requested", () => {
    const m = parse(`graph LR
      subgraph Runtime
        App[App]
        DB[(DB)]
      end
      App --> DB
      ---
      nodes:
        App: { zone: private, layer: runtime }
        DB: { zone: private, layer: data }
      zones:
        private: { label: Private Zone, contains: [App, DB] }
      boundaries:
        data_boundary: { label: Data Boundary, contains: [DB] }
        private_boundary: { label: Private Boundary, contains: [App, data_boundary] }
    `);
    const { svg } = render(m, { baseView: "overview", overlays: ["zone", "boundary"] });
    expect(svg).toContain("archmap-view-overview archmap-overlay-zone archmap-overlay-boundary");
    expect(svg).not.toContain('class="archmap-subgraph archmap-subgraph-depth-');
    expect(svg).toContain('class="archmap-zone archmap-zone-depth-');
    expect(svg).toContain('class="archmap-boundary archmap-boundary-depth-');
    expect(svg).toContain('data-id="private_boundary" data-depth="0"');
    expect(svg).toContain('data-id="data_boundary" data-depth="1"');
    expect(svg).toContain("Private Boundary");
  });

  it("shows subgraph area overlays as borderless translucent backgrounds when requested", () => {
    const m = parse(`graph LR
      subgraph Runtime
        App[App]
        DB[(DB)]
      end
      App --> DB
    `);
    const plain = render(m, { baseView: "overview" }).svg!;
    expect(plain).not.toContain('class="archmap-subgraph archmap-subgraph-depth-');

    const withSubgraph = render(m, { baseView: "overview", overlays: ["subgraph"] }).svg!;
    expect(withSubgraph).toContain("archmap-overlay-subgraph");
    expect(withSubgraph).toContain('class="archmap-subgraph archmap-subgraph-depth-0" data-id="Runtime"');
    expect(withSubgraph).toContain('class="archmap-subgraph-box"');
    expect(withSubgraph).toContain(".archmap-subgraph-box { fill:");
    expect(withSubgraph.match(/\.archmap-subgraph-box \{[^}]*stroke: none/)).toBeTruthy();

    const collapsed = render(m, { baseView: "overview", overlays: ["subgraph"], collapsedAbstractions: ["subgraph:Runtime"] }).svg!;
    expect(collapsed).toContain('data-abstraction-key="subgraph:Runtime"');
    expect(collapsed).not.toContain('class="archmap-subgraph archmap-subgraph-depth-0" data-id="Runtime"');
  });

  it("renders 2D area overlays from back to front as zone, boundary, then subgraph", () => {
    const m = parse(`graph LR
      subgraph Runtime
        App[App]
        DB[(DB)]
      end
      App --> DB
      ---
      nodes:
        App: { zone: private, layer: runtime }
        DB: { zone: private, layer: data }
      zones:
        private: { label: Private Zone, contains: [App, DB] }
      boundaries:
        data_boundary: { label: Data Boundary, contains: [App, DB] }
    `);
    const { svg } = render(m, { baseView: "overview", overlays: ["subgraph", "boundary", "zone"] });
    const zoneIndex = svg!.indexOf('class="archmap-zone archmap-zone-depth-0"');
    const boundaryIndex = svg!.indexOf('class="archmap-boundary archmap-boundary-depth-0"');
    const subgraphIndex = svg!.indexOf('class="archmap-subgraph archmap-subgraph-depth-0"');
    expect(zoneIndex).toBeGreaterThan(-1);
    expect(boundaryIndex).toBeGreaterThan(zoneIndex);
    expect(subgraphIndex).toBeGreaterThan(boundaryIndex);
  });

  it("does not let graph subgraphs affect rendered geometry", () => {
    const m = parse(androidDriverStack);
    const overview = render(m, { baseView: "overview" }).svg!;
    const stack = render(m, { baseView: "layer" }).svg!;
    expect(overview).not.toContain('class="archmap-subgraph archmap-subgraph-depth-0" data-id="Device_A_App"');
    expect(stack).not.toContain('class="archmap-subgraph archmap-subgraph-depth-0" data-id="Device_A_App"');
    expect(overview).not.toContain(">Device A App<");
    expect(stack).not.toContain(">Device A App<");
  });

  it("routes isometric render mode through the interactive 3D renderer slot", () => {
    const m = parse(example);
    const { svg, view } = render(m, { baseView: "overview", renderMode: "isometric", overlays: ["boundary"] });
    expect(view).toBe("3d");
    expect(svg).toContain("3D view is not installed");
  });

  it("summarizes permission overlays without routing extra edges", () => {
    const m = parse(`graph LR
      App[App]
      Admin[Admin]
      DB[(DB)]
      ---
      nodes:
        App: { principal: app-sa }
        Admin: { principal: admin-sa }
        DB: { kind: database }
      permissions:
        db_connect:
          principal: app-sa
          action: connect
          resource: DB
          role: roles/cloudsql.client
        db_admin:
          principal: admin-sa
          action: administer
          resource: DB
          role: roles/cloudsql.admin
    `);
    const svg = render(m, { baseView: "overview", overlays: ["permission"] }).svg!;
    expect(svg).not.toContain('class="archmap-overlay-edge archmap-permission-edge"');
    expect(svg).toContain("archmap-permission-summary");
    expect(svg).toContain(">2 permissions<");
    expect(svg).toContain("roles/cloudsql.client");
  });

  it("renders boundary, dataflow, permission, and validation as grouped semantic badges", () => {
    const m = parse(`graph LR
      App[App] --> API[API]
      API --> DB[(DB)]
      App --> DB
      ---
      nodes:
        App: { zone: client, principal: app-sa }
        API: { zone: app, kind: api_gateway }
        DB: { zone: data, kind: database }
      boundaries:
        public_boundary: { contains: [API] }
        data_boundary: { contains: [DB] }
      zones:
        client: { contains: [App] }
        app: { contains: [API] }
        data: { contains: [DB] }
      edges:
        App->API: { flow: request, boundaryCrossing: [public_boundary] }
        API->DB: { flow: data_write, data: [profile], boundaryCrossing: [data_boundary] }
        App->DB: { flow: data_read, boundaryCrossing: false }
      data:
        profile: { label: User Profile, classification: confidential, storedIn: [DB], flows: [API->DB] }
      permissions:
        db_write: { principal: app-sa, action: write, resource: DB, role: roles/db.writer }
    `);
    const svg = render(m, { baseView: "overview", overlays: ["boundary", "dataflow", "permission", "validation"] }).svg!;
    expect(svg).toContain("archmap-boundary-edge-badge");
    expect(svg).toContain(">public_boundary</text>");
    expect(svg).toContain("archmap-data-edge-badge");
    expect(svg).toContain(">profile</text>");
    expect(svg).toContain("classification: confidential");
    expect(svg).toContain("archmap-permission-badge");
    expect(svg).toContain(">1 permission<");
    expect(svg).toContain("roles/db.writer");
    expect(svg).toContain("archmap-validation-badge");
    expect(svg).toContain("archmap-validation-level-warning");
    expect(svg).toContain("zone_crossing_marked_false");
  });

  it("collapses dense permission overlay labels into target summaries", () => {
    const permissions = Array.from({ length: 9 }, (_, i) => `        p${i}: { principal: app-sa, action: a${i}, resource: DB, role: role-${i} }`).join("\n");
    const m = parse(`graph LR
      App[App]
      DB[(DB)]
      ---
      nodes:
        App: { principal: app-sa }
        DB: { kind: database }
      permissions:
${permissions}
    `);
    const svg = render(m, { baseView: "overview", overlays: ["permission"] }).svg!;
    expect(svg).toContain("archmap-permission-summary");
    expect(svg).toContain(">9 permissions<");
    expect(svg).not.toContain(">role-0<");
    expect(svg).not.toContain(">role-8<");
  });

  it("updates overlays through the render result handle", () => {
    const target = { innerHTML: "" } as Element & { innerHTML: string };
    const m = parse(example);
    const result = render(m, { baseView: "overview", target });
    expect(target.innerHTML).not.toContain("data-overlays");
    result.setOverlays(["boundary"]);
    expect(result.svg).toContain('data-overlays="boundary"');
    expect(target.innerHTML).toContain('class="archmap-boundary archmap-boundary-depth-');
    result.toggleOverlay("boundary");
    expect(result.svg).not.toContain("data-overlays");
    result.destroy();
    expect(target.innerHTML).toBe("");
  });

  it("uses spec-shaped metadata view defaults", () => {
    const m = parse(`graph LR
      A[a] -->|JWT| B[b]
      ---
      nodes:
        A: { kind: web_app }
        B: { kind: api_gateway }
      edges:
        A->B:
          auth: { token: JWT, issuer: A, validatedBy: B }
      view:
        default:
          base: overview
          overlays: [auth]
    `);
    const { svg, view } = render(m);
    expect(view).toBe("overview");
    expect(svg).toContain('data-overlays="auth"');
    expect(svg).toContain(">JWT<");
  });

  it("reports unavailable 3d view from the core fallback", () => {
    const m = parse(`graph LR\nA[a]`);
    const { svg, view } = render(m, { baseView: "3d" });
    expect(view).toBe("3d");
    expect(svg).toContain("3D view is not installed");
    expect(m.warnings.some((d) => d.code === "view_3d_unavailable")).toBe(true);
  });

  it("reports unknown overlays without blocking render", () => {
    const m = parse(`graph LR\nA[a] --> B[b]`);
    const { svg } = render(m, { baseView: "overview", overlays: ["made-up"] });
    expect(svg).toContain("<svg");
    expect(m.warnings.some((d) => d.code === "unknown_overlay")).toBe(true);
    expect(m.diagnostics.some((d) => d.target?.type === "view" && d.target.id === "made-up")).toBe(true);
  });

  it("renders diagnostics to an external target", () => {
    const target = { innerHTML: "" } as Element & { innerHTML: string };
    const m = parse(`graph LR\nA[a]`);
    render(m, { diagnosticsTarget: target });
    expect(target.innerHTML).toContain("archmap-diagnostics");
    expect(target.innerHTML).toContain("node_without_metadata");
    expect(diagnosticsHtml(m)).toContain("Errors 0 / Warnings 0");
  });

  it("renders an inspector to an external target", () => {
    const target = { innerHTML: "" } as Element & { innerHTML: string };
    const m = parse(`graph LR
      App[App] -->|HTTPS| API[API]
      ---
      nodes:
        App: { zone: client, kind: web_app, principal: app-sa }
        API: { zone: gcp, kind: api_gateway }
      identities:
        app-id: { kind: service_account, attachedTo: App }
      data:
        profile: { storedIn: [API], processedBy: [App] }
      permissions:
        call-api: { principal: app-sa, action: invoke, resource: API }
    `);
    render(m, { inspectorTarget: target, selection: { type: "node", id: "App" } });
    expect(target.innerHTML).toContain("archmap-inspector");
    expect(target.innerHTML).toContain("attached identities");
    expect(target.innerHTML).toContain("app-id");
    expect(renderInspector(m, { type: "edge", id: "App__API__0" }, null)).toContain("HTTPS");
  });

  it("escapes special characters in labels", () => {
    const m = parse(`graph LR
      A[a & <b>] --> B[b]
    `);
    const { svg } = render(m);
    expect(svg).toContain("a &amp; &lt;b&gt;");
  });

  it("throws on an unknown view", () => {
    const m = parse(`graph LR\nA[a]`);
    expect(() => render(m, { view: "nope" })).toThrow(/Unknown view/);
    expect(m.warnings.some((d) => d.code === "unknown_base_view")).toBe(true);
    expect(m.diagnostics.some((d) => d.target?.type === "view" && d.target.id === "nope")).toBe(true);
  });

  it("supports custom registered views consuming the layout", () => {
    registerView("count", ({ layout }) => `<svg data-nodes="${layout.nodes.length}"></svg>`);
    const m = parse(`graph LR\nA[a] --> B[b]`);
    const { svg } = render(m, { view: "count" });
    expect(svg).toContain('data-nodes="2"');
  });
});

describe("archmap-viewer attributes", () => {
  it("parses comma-separated overlays", () => {
    expect(parseOverlaysAttribute("zone, auth, dataflow,boundary")).toEqual(["zone", "auth", "dataflow", "boundary"]);
    expect(parseOverlaysAttribute("")).toEqual([]);
  });

  it("uses viewer attribute defaults", () => {
    const attrs = new Map<string, string>([
      ["base-view", "zone"],
      ["render-mode", "isometric"],
      ["overlays", "auth,validation"],
      ["diagnostics-target", "#warnings"],
      ["src", "./arch.archmap"],
    ]);
    const options = viewerOptionsFromAttributes({
      getAttribute: (name: string) => attrs.get(name) ?? null,
      hasAttribute: (name: string) => name === "diagnostics" || name === "fallback-to-inline",
    });
    expect(options).toEqual({
      baseView: "zone",
      renderMode: "isometric",
      overlays: ["auth", "validation"],
      abstractionLevel: 0,
      abstractionTarget: "subgraph",
      width: "100%",
      height: "600px",
      src: "./arch.archmap",
      diagnostics: true,
      diagnosticsTarget: "#warnings",
      inspector: false,
      inspectorTarget: undefined,
      fallbackToInline: true,
      consoleReport: true,
      controls: false,
    });
  });

  it("fetches external ArchMap source", async () => {
    const text = await fetchArchMapSource("./ok.archmap", async () => ({
      ok: true,
      status: 200,
      text: async () => "graph LR\nA[a]",
    } as Response));
    await expect(fetchArchMapSource("./missing.archmap", async () => ({
      ok: false,
      status: 404,
      text: async () => "",
    } as Response))).rejects.toThrow("HTTP 404");
    expect(text).toContain("graph LR");
  });

  it("can render diagnostics without a target", () => {
    const m = parse(`graph LR\nA[a]`);
    expect(renderDiagnostics(m, null)).toContain("archmap-diagnostics-summary");
  });
});
