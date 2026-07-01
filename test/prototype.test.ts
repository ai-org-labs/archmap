import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { listViews, render, viewerOptionsFromAttributes } from "../src/render.js";

const screenflowExample = readFileSync(
  fileURLToPath(new URL("../examples/screenflow.archmap", import.meta.url)),
  "utf8",
);
const complexScreenflowExample = readFileSync(
  fileURLToPath(new URL("./fixtures/screenflow-complex.archmap", import.meta.url)),
  "utf8",
);

describe("screenflow parser", () => {
  it("parses mode, node image/frame, edge trigger/hotspot/transition, and scenarios", () => {
    const model = parse(`graph LR
      Home[Home] --> Detail[Detail]
      ---
      mode: screenflow
      nodes:
        Home:
          kind: screen
          image: ./screens/home.svg
          frame: { device: mobile, width: 390, height: 844 }
        Detail:
          kind: screen
          image: ./screens/detail.svg
      edges:
        Home->Detail:
          flow: navigate
          trigger: tap
          hotspot: { x: 80, y: 220, width: 240, height: 160 }
          transition: { type: fade, duration: 200 }
      scenarios:
        happy_path:
          label: Happy path
          start: Home
          steps: [Home->Detail]
    `);

    expect(model.mode).toBe("screenflow");
    expect(model.nodes.find((node) => node.id === "Home")?.image).toBe("./screens/home.svg");
    expect(model.nodes.find((node) => node.id === "Home")?.frame).toEqual({ device: "mobile", width: 390, height: 844 });
    const edge = model.edges.find((entry) => entry.from === "Home" && entry.to === "Detail")!;
    expect(edge.trigger).toBe("tap");
    expect(edge.hotspot).toEqual({ x: 80, y: 220, width: 240, height: 160 });
    expect(edge.transition).toEqual({ type: "fade", duration: 200 });
    expect(model.scenarios[0]).toMatchObject({ id: "happy_path", start: "Home", steps: ["Home->Detail"] });
  });

  it("parses the bundled screenflow example", () => {
    const model = parse(screenflowExample);
    expect(model.mode).toBe("screenflow");
    expect(model.scenarios.map((scenario) => scenario.id)).toEqual(["happy_path", "error_path"]);
    expect(model.errors).toEqual([]);
    expect(model.edges.some((edge) => edge.trigger === "submit" && edge.hotspot)).toBe(true);
  });

  it("parses a dense branch-heavy screenflow sample", () => {
    const model = parse(complexScreenflowExample);
    expect(model.mode).toBe("screenflow");
    expect(model.nodes.length).toBeGreaterThan(20);
    expect(model.edges.length).toBeGreaterThan(25);
    expect(model.scenarios.length).toBeGreaterThan(4);
    expect(model.errors).toEqual([]);
  });
});

describe("screenflow validation", () => {
  it("reports scenario_unknown_start and scenario_unknown_step", () => {
    const model = parse(`graph LR
      Home[Home]
      ---
      mode: screenflow
      nodes:
        Home: { kind: screen, image: ./screens/home.svg }
      scenarios:
        broken:
          start: Missing
          steps: [Home->Missing]
    `);
    expect(model.errors.some((entry) => entry.code === "scenario_unknown_start")).toBe(true);
    expect(model.errors.some((entry) => entry.code === "scenario_unknown_step")).toBe(true);
  });

  it("reports transition and image security diagnostics", () => {
    const model = parse(`graph LR
      Home[Home] --> External[External]
      ---
      mode: screenflow
      nodes:
        Home:
          kind: screen
          image: javascript:alert(1)
          frame: { width: 100, height: 100 }
        External:
          kind: external_page
          zone: external
      zones:
        external: { kind: partner, contains: [External] }
      edges:
        Home->External:
          flow: navigate
          hotspot: { x: 90, y: 90, width: 40, height: 40 }
    `);
    expect(model.errors.some((entry) => entry.code === "image_url_disallowed")).toBe(true);
    expect(model.suggestions.some((entry) => entry.code === "transition_without_trigger")).toBe(true);
    expect(model.suggestions.some((entry) => entry.code === "screen_node_without_image")).toBe(true);
    expect(model.warnings.some((entry) => entry.code === "hotspot_out_of_bounds")).toBe(true);
    expect(model.warnings.some((entry) => entry.code === "external_transition_without_boundary")).toBe(true);
  });

  it("reports ambiguous_transition when no scenario defines Next order", () => {
    const model = parse(`graph LR
      Home[Home] --> A[A]
      Home --> B[B]
      ---
      mode: screenflow
      nodes:
        Home: { kind: screen, image: ./screens/home.svg }
        A: { kind: screen, image: ./screens/a.svg }
        B: { kind: screen, image: ./screens/b.svg }
      edges:
        Home->A: { trigger: tap }
        Home->B: { trigger: tap }
    `);
    expect(model.suggestions.some((entry) => entry.code === "ambiguous_transition")).toBe(true);
  });
});

describe("prototype view integration", () => {
  it("registers and renders the prototype view without a target", () => {
    expect(listViews()).toContain("prototype");
    const model = parse(screenflowExample);
    const result = render(model, { baseView: "prototype", overlays: ["dataflow", "boundary", "validation"] });
    expect(result.view).toBe("prototype");
    expect(result.svg).toBeUndefined();
    expect(result.layout.nodes.length).toBeGreaterThan(0);
  });

  it("renders the dense branch-heavy screenflow through prototype view", () => {
    const model = parse(complexScreenflowExample);
    const result = render(model, { baseView: "prototype", overlays: ["validation"], scenario: "guest_purchase_requires_login" });
    expect(result.view).toBe("prototype");
    expect(result.svg).toBeUndefined();
    expect(result.layout.nodes.length).toBe(model.nodes.length);
  });

  it("parses prototype custom element attributes", () => {
    const attrs = new Map<string, string>([
      ["base-view", "prototype"],
      ["scenario", "happy_path"],
      ["show-hotspots", "true"],
      ["overlays", "dataflow,boundary,validation"],
    ]);
    const options = viewerOptionsFromAttributes({
      getAttribute: (name: string) => attrs.get(name) ?? null,
      hasAttribute: (name: string) => attrs.has(name),
    });
    expect(options.baseView).toBe("prototype");
    expect(options.scenario).toBe("happy_path");
    expect(options.showHotspots).toBe(true);
    expect(options.overlays).toEqual(["dataflow", "boundary", "validation"]);
  });
});
