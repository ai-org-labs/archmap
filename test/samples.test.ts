import { describe, expect, it } from "vitest";
import { DEFAULT_ARCHMAP_SAMPLE_ID, DEFAULT_ARCHMAP_SAMPLES } from "../src/samples.js";
import { parse } from "../src/parser-entry.js";
import { render } from "../src/render.js";
import { analyzeTopology } from "../src/topology-analysis.js";
import { normalizeTopology } from "../src/topology-normalize.js";

describe("default samples", () => {
  it("exposes about ten curated samples with a stable default", () => {
    expect(DEFAULT_ARCHMAP_SAMPLES.length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_ARCHMAP_SAMPLES.some((sample) => sample.id === DEFAULT_ARCHMAP_SAMPLE_ID)).toBe(true);
    expect(new Set(DEFAULT_ARCHMAP_SAMPLES.map((sample) => sample.id)).size).toBe(DEFAULT_ARCHMAP_SAMPLES.length);
  });

  it("parses every curated sample without errors or unknown-vocabulary warnings", () => {
    for (const sample of DEFAULT_ARCHMAP_SAMPLES) {
      const model = parse(sample.source);
      expect(model.errors, sample.id).toEqual([]);
      const unknownWarnings = model.warnings.filter((entry) => entry.code.startsWith("unknown_"));
      expect(unknownWarnings, sample.id).toEqual([]);
    }
  });

  it("renders every curated sample through its recommended base view", () => {
    for (const sample of DEFAULT_ARCHMAP_SAMPLES) {
      const model = parse(sample.source);
      const result = render(model, {
        baseView: sample.recommendation.baseView,
        renderMode: "2d",
        overlays: sample.recommendation.overlays,
      });
      expect(result.view, sample.id).toBe(sample.recommendation.baseView);
      expect(result.layout.nodes.length, sample.id).toBeGreaterThan(0);
    }
  });

  it("authors the Android platform stack left-to-right for readable layer flow", () => {
    const sample = DEFAULT_ARCHMAP_SAMPLES.find((entry) => entry.id === "android-platform-stack");
    expect(sample).toBeDefined();
    expect(parse(sample!.source).direction).toBe("LR");
    expect(sample!.recommendation.baseView).toBe("layer");
  });

  it("derives Container Crossings and PCI Overlay Transitions from the Next sample", () => {
    const sample = DEFAULT_ARCHMAP_SAMPLES.find((entry) => entry.id === "next-boundary-crossings");
    expect(sample).toBeDefined();

    const normalized = normalizeTopology(parse(sample!.source));
    const analysis = analyzeTopology(normalized.topology);
    const edge = normalized.topology.edges.find((entry) => entry.from === "EdgeLB" && entry.to === "API");
    const partnerEdge = normalized.topology.edges.find((entry) => entry.from === "API" && entry.to === "Partner");

    expect(edge).toBeDefined();
    expect(partnerEdge).toBeDefined();
    expect(analysis.crossingsForEdge(edge!.id).map((crossing) => [crossing.boundaryId, crossing.direction]))
      .toEqual([
        ["public_subnet", "exit"],
        ["app_subnet", "enter"],
      ]);
    expect(analysis.overlayTransitionForEdge(edge!.id)).toMatchObject({ gained: ["pci_scope"] });
    expect(analysis.overlayTransitionForEdge(partnerEdge!.id)).toMatchObject({ lost: ["pci_scope"] });
  });

  it("models the AWS tutorial as direct multi-AZ communication without shortcut edges", () => {
    const sample = DEFAULT_ARCHMAP_SAMPLES.find((entry) => entry.id === "aws-multi-az-web");
    expect(sample).toBeDefined();

    const normalized = normalizeTopology(parse(sample!.source));
    const analysis = analyzeTopology(normalized.topology);
    const edgePairs = normalized.topology.edges.map((edge) => `${edge.from}->${edge.to}`);

    expect(normalized.topology.resources).toHaveLength(7);
    expect(normalized.topology.containers).toHaveLength(9);
    expect(normalized.topology.overlays).toHaveLength(0);
    expect(normalized.topology.containers.find((container) => container.id === "availability_zone_a")?.parent)
      .toBe("production_vpc");
    expect(normalized.topology.containers.find((container) => container.id === "public_subnet_a")?.parent)
      .toBe("availability_zone_a");
    expect(edgePairs).not.toContain("User->WebA");
    expect(edgePairs).not.toContain("User->DatabaseA");
    expect(edgePairs).toContain("User->LoadBalancerA");
    expect(edgePairs).toContain("LoadBalancerA->WebA");
    expect(edgePairs).toContain("WebA->DatabaseA");
    expect(analysis.valid).toBe(true);
  });
});
