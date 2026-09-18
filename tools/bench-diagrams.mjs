import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { parseDiagram, renderDiagram, DIAGRAM_SAMPLES } from "../dist/diagrams.js";

const stress = `diagram system LR\ntitle "40-node grid"\n${Array.from({length:40},(_,i)=>`node n${i} "Service ${i + 1}" at=${i%8+1},${Math.floor(i/8)+1}`).join("\n")}\n${Array.from({length:35},(_,i)=>`n${i+Math.floor(i/7)} -> n${i+Math.floor(i/7)+1} "request"`).join("\n")}`;
const grouped = ['diagram system LR',
  ...Array.from({length:200}, (_,i) => `group g${i} "Group ${i}"`),
  ...Array.from({length:400}, (_,i) => `node n${i} "Service ${i}" group=g${Math.floor(i/2)} at=${i%2+1},${Math.floor(i/2)+1}`),
  ...Array.from({length:200}, (_,i) => `n${i*2} -> n${i*2+1} "request"`),
].join('\n');
const dense = ['diagram system LR',
  ...Array.from({length:400}, (_,i) => `node n${i} "Service ${i}" at=${i%20+1},${Math.floor(i/20)+1}`),
  ...Array.from({length:1000}, (_,i) => { const from = i % 380 + Math.floor((i % 380)/19); return `n${from} -> n${from+1}`; }),
].join('\n');
const cases = [...DIAGRAM_SAMPLES, {id:"40-node grid",source:stress}, {id:"400 nodes / 200 groups", source:grouped}, {id:"400 nodes / 1000 edges", source:dense}];
for (const item of cases) {
  const times = [];
  let svg = "";
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    const model = parseDiagram(item.source);
    assert(!model.diagnostics.some((diagnostic) => diagnostic.severity === "error"), `${item.id}: source errors`);
    const result = renderDiagram(model);
    if (i > 1) times.push(performance.now()-start);
    assert(result.svg === (svg || result.svg), `${item.id}: deterministic rendering`);
    svg = result.svg;
  }
  times.sort((a,b)=>a-b);
  const p50 = times[Math.floor(times.length*.5)];
  const p95 = times[Math.floor(times.length*.95)];
  console.log(`${item.id.padEnd(14)} parse + layout + SVG p50 ${p50.toFixed(1).padStart(6)} ms · p95 ${p95.toFixed(1).padStart(6)} ms · ${(Buffer.byteLength(svg)/1024).toFixed(1)} KB SVG`);
  // A broad regression guard, not a device-independent interactivity promise.
  assert(p95 < 2000, `${item.id}: exceeded two-second regression budget`);
}
