import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser-entry.js";
import { render } from "../src/render.js";

const sampleFiles = [
  "01-small-web-basic.archmap",
  "02-medium-auth-external-integrations.archmap",
  "03-large-multiregion-hybrid-ops.archmap",
  "04-android-single-app-framework-api.archmap",
  "05-android-inter-app-collaboration.archmap",
  "06-android-framework-driver-bt-devices.archmap",
  "07-migration-timeline.archmap",
] as const;

const allowedWarningCodes = new Set(["zone_crossing_marked_false"]);

function readSample(file: string): string {
  return readFileSync(
    fileURLToPath(new URL(`fixtures/pattern-samples/${file}`, import.meta.url)),
    "utf8",
  );
}

describe("pattern sample fixtures", () => {
  it.each(sampleFiles)("parses %s without errors or unexpected diagnostics", (file) => {
    const model = parse(readSample(file));
    const unexpected = model.diagnostics.filter((entry) => !allowedWarningCodes.has(entry.code));

    expect(model.errors).toHaveLength(0);
    expect(unexpected).toEqual([]);
  });

  it.each(sampleFiles)("renders %s across 2D base views and overlays", (file) => {
    const model = parse(readSample(file));
    const renderCases = [
      { baseView: "overview", overlays: ["zone", "boundary", "validation"] },
      { baseView: "overview", overlays: ["zone", "auth", "dataflow", "boundary", "permission", "validation"] },
      { baseView: "layer", overlays: ["zone", "boundary", "validation"] },
    ];

    for (const renderCase of renderCases) {
      const { svg, view } = render(model, renderCase);
      expect(view).toBe(renderCase.baseView);
      expect(svg).toMatch(new RegExp(`class="archmap archmap-view-${renderCase.baseView}(\\s|")`));
      expect(svg).toContain("<path");
    }
  });

  it("renders the migration timeline sample across every phase", () => {
    const model = parse(readSample("07-migration-timeline.archmap"));
    const phases = model.timeline?.phases.map((phase) => phase.id) ?? [];
    expect(phases).toEqual(["now", "parallel", "cutover", "done"]);
    for (const phase of phases) {
      for (const baseView of ["overview", "layer"] as const) {
        const { svg } = render(model, { baseView, overlays: ["zone", "timeline"], phase });
        expect(svg).toContain(`data-phase="${phase}"`);
        expect(svg).toContain("<path");
      }
    }
  });
});
