#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { computeLayout, parse, render } from "../dist/archmap.js";

const CASES = {
  small: "test/fixtures/pattern-samples/01-small-web-basic.archmap",
  medium: "test/fixtures/pattern-samples/02-medium-auth-external-integrations.archmap",
  large: "test/fixtures/pattern-samples/03-large-multiregion-hybrid-ops.archmap",
  comprehensive: "test/fixtures/comprehensive.archmap",
  screenflow: "examples/screenflow.archmap",
};

const RENDER_CASES = {
  overview: { baseView: "overview" },
  "overview+all": { baseView: "overview", overlays: ["subgraph", "zone", "auth", "dataflow", "boundary", "permission", "validation"] },
  "stack+zone": { baseView: "layer", overlays: ["zone", "boundary", "validation"] },
  prototype: { baseView: "prototype", overlays: ["dataflow", "boundary", "validation"] },
};

function argValue(name, fallback) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return exact ? exact.slice(name.length + 1) : fallback;
}

function selectedNames(value, all) {
  if (value === "all") return Object.keys(all);
  return value.split(",").map((name) => name.trim()).filter(Boolean);
}

function measure(fn, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    min: samples[0],
    p50: samples[Math.floor(samples.length / 2)],
    max: samples[samples.length - 1],
  };
}

function format(ms) {
  return `${ms.toFixed(1)}ms`;
}

const caseNames = selectedNames(argValue("--case", "medium"), CASES);
const renderNames = selectedNames(argValue("--view", "overview,overview+all,stack+zone"), RENDER_CASES);
const iterations = Math.max(1, Number(argValue("--iterations", "3")) || 3);

console.log(`ArchMap render benchmark; iterations=${iterations}`);
for (const name of caseNames) {
  const file = CASES[name];
  if (!file) {
    console.error(`Unknown case: ${name}`);
    process.exitCode = 1;
    continue;
  }
  const source = readFileSync(file, "utf8");
  const parseTime = measure(() => parse(source), iterations);
  const model = parse(source);
  const layoutTime = measure(() => computeLayout(model), iterations);
  console.log(`\n${name} (${file})`);
  console.log(`  model nodes=${model.nodes.length} edges=${model.edges.length} diagnostics=${model.diagnostics.length}`);
  console.log(`  parse  min=${format(parseTime.min)} p50=${format(parseTime.p50)} max=${format(parseTime.max)}`);
  console.log(`  layout min=${format(layoutTime.min)} p50=${format(layoutTime.p50)} max=${format(layoutTime.max)}`);
  for (const renderName of renderNames) {
    if (renderName === "prototype" && model.mode !== "screenflow" && model.profile !== "screenflow") continue;
    const options = RENDER_CASES[renderName];
    if (!options) {
      console.error(`Unknown view benchmark: ${renderName}`);
      process.exitCode = 1;
      continue;
    }
    const renderTime = measure(() => render(model, options), iterations);
    console.log(`  render:${renderName} min=${format(renderTime.min)} p50=${format(renderTime.p50)} max=${format(renderTime.max)}`);
    const { timings } = render(model, options);
    if (timings) {
      const phases = timings.layoutPhases
        ? ` (placement=${format(timings.layoutPhases.placementMs)} route=${format(timings.layoutPhases.routeMs)} labels=${format(timings.layoutPhases.labelMs)})`
        : "";
      console.log(`    phases: projection=${format(timings.projectionMs)} layout=${format(timings.layoutMs)}${phases} view=${format(timings.viewMs)} dom=${format(timings.domMs)}`);
    }
  }
}
