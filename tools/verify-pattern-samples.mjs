#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, render, validateRenderedSvgPorts } from "../dist/archmap.js";

const samples = [
  "01-small-web-basic.archmap",
  "02-medium-auth-external-integrations.archmap",
  "03-large-multiregion-hybrid-ops.archmap",
  "04-android-single-app-framework-api.archmap",
  "05-android-inter-app-collaboration.archmap",
  "06-android-framework-driver-bt-devices.archmap",
];

const baseViews = ["overview", "zone", "layer"];
const overlays = ["auth", "dataflow", "boundary", "permission", "validation"];
const allowedDiagnosticCodes = new Set(["zone_crossing_marked_false", "view_3d_unavailable"]);

const fixtureUrl = new URL("../test/fixtures/pattern-samples/", import.meta.url);
const overlaySets = Array.from({ length: 1 << overlays.length }, (_unused, mask) =>
  overlays.filter((_overlay, i) => mask & (1 << i)),
);

function readSample(file) {
  return readFileSync(fileURLToPath(new URL(file, fixtureUrl)), "utf8");
}

function numbers(value) {
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function viewBox(svg) {
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match) throw new Error("missing viewBox");
  const [x, y, width, height] = numbers(match[1]);
  return { x, y, width, height };
}

function edgePaths(svg) {
  return [...svg.matchAll(/<path class="archmap-edge-path" d="([^"]+)"/g)].map((match) => match[1]);
}

function pathPoints(path) {
  const parts = [...path.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  return parts.map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

function pointInBox(point, box, tolerance = 0.5) {
  return point.x >= box.x - tolerance
    && point.y >= box.y - tolerance
    && point.x <= box.x + box.width + tolerance
    && point.y <= box.y + box.height + tolerance;
}

function isOrthogonal(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) return false;
  }
  return true;
}

function unexpectedDiagnostics(model) {
  return model.diagnostics.filter((entry) => !allowedDiagnosticCodes.has(entry.code));
}

const results = [];
const failures = [];

for (const sample of samples) {
  const source = readSample(sample);
  const parsed = parse(source);
  const baseUnexpected = unexpectedDiagnostics(parsed);
  if (parsed.errors.length || baseUnexpected.length) {
    failures.push({
      sample,
      stage: "parse",
      errors: parsed.errors.map((entry) => entry.code),
      unexpectedDiagnostics: baseUnexpected.map((entry) => entry.code),
    });
  }

  let renders = 0;
  let maxPaths = 0;
  let maxStartpoints = 0;

  for (const baseView of baseViews) {
    for (const overlaySet of overlaySets) {
      const model = parse(source);
      const { svg, view } = render(model, { baseView, renderMode: "2d", overlays: overlaySet });
      renders++;
      if (view !== baseView) failures.push({ sample, baseView, overlays: overlaySet, stage: "view", view });
      if (!svg?.includes(`archmap-view-${baseView}`)) failures.push({ sample, baseView, overlays: overlaySet, stage: "svg-class" });
      if (svg?.match(/\b(?:NaN|undefined|Infinity)\b/)) failures.push({ sample, baseView, overlays: overlaySet, stage: "invalid-svg-token" });

      if (svg) {
        const box = viewBox(svg);
        const paths = edgePaths(svg);
        const startpoints = (svg.match(/class="archmap-edge-startpoint"/g) ?? []).length;
        const portFailures = validateRenderedSvgPorts(svg);
        maxPaths = Math.max(maxPaths, paths.length);
        maxStartpoints = Math.max(maxStartpoints, startpoints);
        if (paths.length !== startpoints) failures.push({ sample, baseView, overlays: overlaySet, stage: "startpoint-count", paths: paths.length, startpoints });
        for (const failure of portFailures) failures.push({ sample, baseView, overlays: overlaySet, stage: "port-validation", failure });
        for (const path of paths) {
          const points = pathPoints(path);
          if (!isOrthogonal(points)) failures.push({ sample, baseView, overlays: overlaySet, stage: "diagonal-path", path });
          for (const point of points) {
            if (!pointInBox(point, box)) failures.push({ sample, baseView, overlays: overlaySet, stage: "path-outside-viewbox", point, box });
          }
        }
      }

      const unexpected = unexpectedDiagnostics(model);
      if (model.errors.length || unexpected.length) {
        failures.push({
          sample,
          baseView,
          overlays: overlaySet,
          stage: "render-diagnostics",
          errors: model.errors.map((entry) => entry.code),
          unexpectedDiagnostics: unexpected.map((entry) => entry.code),
        });
      }
    }
  }

  for (const renderMode of ["isometric", "3d"]) {
    const model = parse(source);
    const { svg, view } = render(model, { baseView: "overview", renderMode, overlays });
    if (view !== "3d") failures.push({ sample, renderMode, stage: "3d-view-route", view });
    if (!svg?.includes("3D view is not installed")) failures.push({ sample, renderMode, stage: "3d-fallback" });
    const unexpected = unexpectedDiagnostics(model);
    if (model.errors.length || unexpected.length) {
      failures.push({
        sample,
        renderMode,
        stage: "3d-diagnostics",
        errors: model.errors.map((entry) => entry.code),
        unexpectedDiagnostics: unexpected.map((entry) => entry.code),
      });
    }
  }

  results.push({
    sample,
    nodes: parsed.nodes.length,
    edges: parsed.edges.length,
    zones: parsed.zones.length,
    boundaries: parsed.boundaries.length,
    diagnostics: parsed.diagnostics.map((entry) => entry.code),
    renders,
    maxPaths,
    maxStartpoints,
  });
}

const report = {
  samples: results.length,
  baseViews,
  overlays,
  overlaySets: overlaySets.length,
  total2dRenders: results.reduce((sum, entry) => sum + entry.renders, 0),
  results,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
