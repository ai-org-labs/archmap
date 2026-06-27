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
  return [...svg.matchAll(/<g class="archmap-node [^"]+" data-id="([^"]+)">([\s\S]*?)<\/g>/g)].flatMap((match) => {
    const body = match[2];
    const rect = body.match(/<rect class="archmap-node-shape" x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/);
    if (!rect) return [];
    const x = Number(rect[1]);
    const y = Number(rect[2]);
    const w = Number(rect[3]);
    const h = Number(rect[4]);
    return [{ id: match[1], x0: x, x1: x + w, y0: y, y1: y + h }];
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
  });

  it("keeps overview structural until information layers are added", () => {
    const m = parse(example);
    const plain = render(m, { baseView: "overview" });
    expect(plain.svg).toContain("archmap-view-overview");
    expect(plain.svg).not.toContain("data-overlays=");
    expect(plain.svg).not.toContain("archmap-overlay-auth");

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
    expect(layerSvg).toContain('class="archmap-subgraph archmap-subgraph-depth-0" data-id="Device_A_App"');
    expect(layerSvg).toContain(">Device A App<");
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

  it("routes isometric render mode through the interactive 3D renderer slot", () => {
    const m = parse(example);
    const { svg, view } = render(m, { baseView: "overview", renderMode: "isometric", overlays: ["boundary"] });
    expect(view).toBe("3d");
    expect(svg).toContain("3D view is not installed");
  });

  it("combines boundary overlay boxes with overview base", () => {
    const m = parse(example);
    const { svg } = render(m, { baseView: "overview", overlays: ["zone", "boundary"] });
    expect(svg).toContain("archmap-view-overview archmap-overlay-zone archmap-overlay-boundary");
    expect(svg).toContain('class="archmap-zone archmap-zone-depth-');
    expect(svg).toContain('class="archmap-boundary archmap-boundary-depth-');
    expect(svg).toContain("GCP Private Boundary");
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
