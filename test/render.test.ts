import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { render, registerView, listViews } from "../src/render.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);

describe("render", () => {
  it("registers the overview view by default", () => {
    expect(listViews()).toContain("overview");
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
      ---
      nodes:
        App: { principal: app-sa }
        DB: { kind: database }
      permissions:
        db_connect:
          principal: app-sa
          action: connect
          resource: DB
          role: roles/cloudsql.client
    `);
    const { svg } = render(m, { baseView: "overview", overlays: ["permission"] });
    expect(svg).toContain('class="archmap-overlay-edge archmap-permission-edge"');
    expect(svg).toContain('data-id="permission:db_connect:App-&gt;DB"');
    expect(svg).toContain("roles/cloudsql.client");
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
