import { describe, expect, it } from "vitest";
import { parse } from "../src/parser-entry.js";
import { render, viewerOptionsFromAttributes } from "../src/render.js";

const graphAndNodes = `graph LR
  Web[Web] --> AppOld[Legacy App]
  Web --> AppNew[Cloud App]
  AppOld --> DbOld[(Legacy DB)]
  AppNew --> DbNew[(Cloud DB)]
  DbOld --> DbNew
---
nodes:
  Web: { zone: client, layer: client, kind: web_app }
  AppOld:
    zone: onprem
    layer: runtime
    kind: runtime_service
    lifecycle: { removed: done, states: { cutover: deprecated } }
  DbOld:
    zone: onprem
    layer: data
    kind: legacy_database
    lifecycle: { removed: done }
  AppNew:
    zone: cloud
    layer: runtime
    kind: runtime_service
    lifecycle: { added: parallel, states: { parallel: planned, cutover: active } }
  DbNew:
    zone: cloud
    layer: data
    kind: relational_database
    lifecycle: { added: parallel }
edges:
  DbOld->DbNew:
    flow: replication
    lifecycle: { added: parallel, removed: done }
zones:
  client: { label: Client, kind: client, contains: [Web] }
  onprem:
    label: On-premises
    kind: onprem
    contains: [AppOld, DbOld]
    lifecycle: { removed: done }
  cloud:
    label: Cloud
    kind: cloud
    contains: [AppNew, DbNew]
    lifecycle: { added: parallel }
`;

const timelineSection = `timeline:
  phases:
    now: { label: Today }
    parallel: { label: Parallel run }
    cutover: { label: Cutover }
    done: { label: Cloud only }
  default: now
`;

const migrationExample = `${graphAndNodes}${timelineSection}`;

// Same document but without lifecycles/timeline: used for the parity check.
const parityGraph = `graph LR
  A[Alpha] --> B[Beta]
  B --> C[(Gamma)]
---
nodes:
  A: { zone: web, layer: client, kind: web_app }
  B: { zone: web, layer: runtime, kind: runtime_service }
  C: { zone: web, layer: data, kind: relational_database }
zones:
  web: { label: Web, kind: client, contains: [A, B, C] }
`;

function stripPhaseDecoration(svg: string): string {
  return svg
    .replace(/ data-phase="[^"]*"/, "")
    .replace(/ archmap-phase-[a-z0-9_-]+/i, "");
}

function nodeTransformOf(svg: string, id: string): string {
  // The node group markup carries the geometry; grab the whole opening tag
  // region (database cylinders need the larger bound).
  const match = svg.match(new RegExp(`<g class="archmap-node[^"]*" data-id="${id}"[^>]*>[\\s\\S]{0,800}?</g>`));
  if (!match) return "";
  // Strip class differences; keep coordinates.
  return match[0].replace(/class="[^"]*"/, "").replace(/\s+/g, " ");
}

describe("timeline rendering", () => {
  it("keeps phase-less documents byte-identical through the shared overlay path (parity)", () => {
    for (const baseView of ["overview", "layer"] as const) {
      const plain = render(parse(parityGraph), { baseView }).svg!;
      const timelineDoc = `${parityGraph}timeline:\n  phases:\n    p1: { label: Phase one }\n`;
      const throughOverlayPath = render(parse(timelineDoc), { baseView }).svg!;
      expect(stripPhaseDecoration(throughOverlayPath)).toBe(plain);
    }
  });

  it("stamps the SVG root with the active phase", () => {
    const result = render(parse(migrationExample), { baseView: "overview" });
    expect(result.svg).toContain('data-phase="now"');
    expect(result.svg).toContain("archmap-phase-now");
  });

  it("ghosts absent elements and styles lifecycle states per phase", () => {
    const model = parse(migrationExample);
    const now = render(model, { baseView: "overview", phase: "now" }).svg!;
    expect(now).toMatch(/archmap-node[^"]*archmap-phase-absent[^"]*" data-id="AppNew"/);
    expect(now).not.toMatch(/data-id="AppOld"[^>]*archmap-phase-absent/);
    // Zone boxes only render with the zone overlay; the absent zone ghosts there.
    const nowWithZones = render(model, { baseView: "overview", phase: "now", overlays: ["zone"] }).svg!;
    expect(nowWithZones).toMatch(/archmap-zone[^"]*archmap-phase-absent[^"]*" data-id="cloud"/);

    const parallel = render(model, { baseView: "overview", phase: "parallel" }).svg!;
    expect(parallel).toMatch(/archmap-node[^"]*archmap-lifecycle-planned[^"]*" data-id="AppNew"/);

    const cutover = render(model, { baseView: "overview", phase: "cutover" }).svg!;
    expect(cutover).toMatch(/archmap-node[^"]*archmap-lifecycle-deprecated[^"]*" data-id="AppOld"/);

    const done = render(model, { baseView: "overview", phase: "done" }).svg!;
    expect(done).toMatch(/archmap-node[^"]*archmap-phase-absent[^"]*" data-id="AppOld"/);
    expect(done).not.toMatch(/archmap-node[^"]*archmap-phase-absent[^"]*" data-id="AppNew"/);
  });

  it("keeps node geometry identical across phases (stable layout)", () => {
    const model = parse(migrationExample);
    const now = render(model, { baseView: "overview", phase: "now" }).svg!;
    const done = render(model, { baseView: "overview", phase: "done" }).svg!;
    for (const id of ["Web", "AppOld", "AppNew", "DbOld", "DbNew"]) {
      expect(nodeTransformOf(now, id)).toBe(nodeTransformOf(done, id));
      expect(nodeTransformOf(now, id)).not.toBe("");
    }
  });

  it("switches phases via setPhase without recomputing layout", () => {
    const result = render(parse(migrationExample), { baseView: "overview" });
    const layoutBefore = result.layout;
    expect(result.getPhase()).toBe("now");
    expect(result.listPhases().map((p) => p.id)).toEqual(["now", "parallel", "cutover", "done"]);

    result.setPhase("cutover");
    expect(result.getPhase()).toBe("cutover");
    expect(result.svg).toContain('data-phase="cutover"');
    // Cache-correctness invariant: phase switching is decoration-only.
    expect(result.layout).toBe(layoutBefore);

    result.setPhase(null);
    expect(result.getPhase()).toBe("now");
  });

  it("is a no-op on documents without a timeline", () => {
    const result = render(parse(parityGraph), { baseView: "overview" });
    expect(result.getPhase()).toBeNull();
    expect(result.listPhases()).toEqual([]);
    const svgBefore = result.svg;
    result.setPhase("anything");
    expect(result.svg).toBe(svgBefore);
    expect(result.svg).not.toContain("data-phase");
  });

  it("maps the viewer phase attribute into options", () => {
    const attrs = new Map([["phase", "cutover"]]);
    const options = viewerOptionsFromAttributes({
      getAttribute: (name: string) => attrs.get(name) ?? null,
      hasAttribute: (name: string) => attrs.has(name),
    });
    expect(options.phase).toBe("cutover");
    const empty = viewerOptionsFromAttributes({ getAttribute: () => null, hasAttribute: () => false });
    expect(empty.phase).toBeUndefined();
  });

  it("renders the timeline overlay lens (badges + emphasis on changes)", () => {
    const model = parse(migrationExample);
    const parallel = render(model, { baseView: "overview", phase: "parallel", overlays: ["timeline"] }).svg!;
    // AppNew appears at parallel: emphasized with a "+ Parallel run" badge.
    expect(parallel).toMatch(/archmap-node[^"]*archmap-emphasis[^"]*" data-id="AppNew"/);
    expect(parallel).toContain("+ Parallel run");
    // Untouched node fades under the lens.
    expect(parallel).toMatch(/archmap-node[^"]*archmap-faded[^"]*" data-id="Web"/);

    const cutover = render(model, { baseView: "overview", phase: "cutover", overlays: ["timeline"] }).svg!;
    expect(cutover).toContain("deprecated");
  });
});
