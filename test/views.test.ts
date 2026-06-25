import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { render, listViews } from "../src/render.js";
import { computeLayout } from "../src/layout.js";

const example = readFileSync(
  fileURLToPath(new URL("../examples/multi-cloud.archmap", import.meta.url)),
  "utf8",
);
const model = parse(example);

describe("view registry", () => {
  it("registers all six required v0.1 views", () => {
    const views = listViews();
    for (const v of ["overview", "zone", "auth", "dataflow", "boundary", "validation"]) {
      expect(views).toContain(v);
    }
  });
});

describe("zone view", () => {
  it("uses the zone-ranked layout (same zone => same column center)", () => {
    const layout = computeLayout(model, { rankBy: "zone" });
    // Nodes are centered within their band, so same-zone nodes share a center.
    const cx = Object.fromEntries(layout.nodes.map((n) => [n.id, n.x + n.w / 2]));
    expect(cx.APIGW).toBe(cx.GCPApp); // both gcp
    expect(cx.GCPApp).toBe(cx.CloudSQL);
    expect(cx.AWSApp).toBe(cx.RDS); // both aws
    expect(cx.User).not.toBe(cx.APIGW); // client vs gcp
  });

  it("emphasizes cross-zone edges", () => {
    const { svg } = render(model, { view: "zone" });
    expect(svg).toContain('class="archmap-edge archmap-emphasis" data-id="web_api"');
  });
});

describe("auth view", () => {
  it("emphasizes identity providers and token edges, fades data nodes", () => {
    const { svg } = render(model, { view: "auth" });
    expect(svg).toContain('archmap-emphasis" data-id="FirebaseAuth"');
    expect(svg).toContain('class="archmap-edge archmap-emphasis" data-id="web_api"');
    expect(svg).toContain('archmap-faded" data-id="CloudSQL"');
  });
});

describe("dataflow view", () => {
  it("emphasizes storage nodes and data edges with classification badges", () => {
    const { svg } = render(model, { view: "dataflow" });
    expect(svg).toContain('archmap-emphasis" data-id="CloudSQL"');
    expect(svg).toContain('class="archmap-edge archmap-emphasis" data-id="gcp_db"');
    expect(svg).toContain('class="archmap-badge"');
    expect(svg).toContain(">personal<");
  });
});

describe("boundary view", () => {
  it("draws boundary boxes and emphasizes boundary-crossing edges", () => {
    const { svg } = render(model, { view: "boundary" });
    expect(svg).toContain('class="archmap-boundary"');
    expect(svg).toContain("GCP Private Boundary");
    expect(svg).toContain('class="archmap-edge archmap-emphasis" data-id="web_api"');
  });
});

describe("validation view", () => {
  it("renders without flagged elements on a clean model", () => {
    const clean = parse(`graph LR
      A[a] --> B[b]
      ---
      nodes:
        A: { zone: gcp, layer: runtime, kind: runtime_service }
        B: { zone: gcp, layer: data, kind: database }
    `);
    const { svg } = render(clean, { view: "validation" });
    expect(svg).toContain("archmap-view-validation");
    // Nothing flagged => no element carries the faded class (the class name
    // still appears once in the embedded stylesheet, hence the precise match).
    expect(svg).not.toContain('archmap-faded" data-id');
  });

  it("flags nodes referenced by warnings", () => {
    const m = parse(`graph LR
      A[a]
      ---
      nodes:
        A: { kind: spaceship }
    `);
    const { svg } = render(m, { view: "validation" });
    expect(svg).toContain('archmap-emphasis" data-id="A"');
  });
});
