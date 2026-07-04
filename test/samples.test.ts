import { describe, expect, it } from "vitest";
import { DEFAULT_ARCHMAP_SAMPLE_ID, DEFAULT_ARCHMAP_SAMPLES } from "../src/samples.js";
import { parse } from "../src/parser-entry.js";
import { render } from "../src/render.js";

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
});
