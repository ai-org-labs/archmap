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
    // Zones are drawn.
    expect(svg).toContain('class="archmap-zone"');
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

  it("routes isometric render mode through the interactive 3D renderer slot", () => {
    const m = parse(example);
    const { svg, view } = render(m, { baseView: "overview", renderMode: "isometric", overlays: ["boundary"] });
    expect(view).toBe("3d");
    expect(svg).toContain("3D view is not installed");
  });

  it("combines boundary overlay boxes with overview base", () => {
    const m = parse(example);
    const { svg } = render(m, { baseView: "overview", overlays: ["boundary"] });
    expect(svg).toContain("archmap-view-overview archmap-overlay-boundary");
    expect(svg).toContain('class="archmap-boundary"');
    expect(svg).toContain("GCP Private Boundary");
  });

  it("synthesizes permission overlay edges", () => {
    const m = parse(`graph LR
      App[App] --> DB[(DB)]
      Admin[Admin] --> DB
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
    expect(svg).toContain('class="archmap-overlay-edge archmap-permission-edge"');
    expect(svg).toContain('data-id="permission:db_connect:App-&gt;DB"');
    expect(svg).toContain("roles/cloudsql.client");
    expect(svg).toContain("roles/cloudsql.admin");
    const permissionPaths = [...svg.matchAll(/class="archmap-overlay-edge archmap-permission-edge" data-id="permission:[^"]+">.*?<path class="archmap-edge-path" d="([^"]+)"/g)].map((m) => m[1]);
    expect(permissionPaths.length).toBe(2);
    expect(permissionPaths.every((d) => (d.match(/\bL\b/g) ?? []).length >= 3)).toBe(true);
    const labelYs = [...svg.matchAll(/roles\/cloudsql\.(?:client|admin).*?<\/text>/g)]
      .map((match) => {
        const rect = svg.slice(Math.max(0, match.index! - 180), match.index);
        return rect.match(/ y="([0-9.]+)"/)?.[1];
      })
      .filter(Boolean);
    expect(new Set(labelYs).size).toBeGreaterThanOrEqual(2);
  });

  it("collapses dense permission overlay labels into target summaries", () => {
    const permissions = Array.from({ length: 9 }, (_, i) => `        p${i}: { principal: app-sa, action: a${i}, resource: DB, role: role-${i} }`).join("\n");
    const m = parse(`graph LR
      App[App] --> DB[(DB)]
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
    expect(target.innerHTML).toContain('class="archmap-boundary"');
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
    expect(parseOverlaysAttribute("auth, dataflow,boundary")).toEqual(["auth", "dataflow", "boundary"]);
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
