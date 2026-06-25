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
  });

  it("supports custom registered views consuming the layout", () => {
    registerView("count", ({ layout }) => `<svg data-nodes="${layout.nodes.length}"></svg>`);
    const m = parse(`graph LR\nA[a] --> B[b]`);
    const { svg } = render(m, { view: "count" });
    expect(svg).toContain('data-nodes="2"');
  });
});
