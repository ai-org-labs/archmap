import type { MountableView, ViewContext, ViewHandle } from "../render.js";
import {
  buildRuntimeGraph,
  projectRuntimeGraph,
  runtimeGraphToCsv,
  runtimeGraphToJson,
  runtimeMetricValue,
} from "../runtime.js";
import type {
  RuntimeGraph,
  RuntimeGraphEdge,
  RuntimeGraphMode,
  RuntimeGraphNode,
  RuntimeGroupBy,
  RuntimeMeasure,
} from "../runtime.js";

interface PositionedNode extends RuntimeGraphNode { x: number; y: number; w: number; h: number; }
interface RuntimeLayout { nodes: PositionedNode[]; width: number; height: number; }

const NODE_W = 188;
const NODE_H = 96;
const GAP_X = 92;
const GAP_Y = 42;

function layoutGraph(graph: RuntimeGraph): RuntimeLayout {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const rank = new Map<string, number>();
  const queue = graph.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  if (queue.length === 0 && graph.nodes[0]) queue.push(graph.nodes[0].id);
  queue.forEach((id) => rank.set(id, 0));
  const remainingIncoming = new Map(incoming);
  while (queue.length) {
    const id = queue.shift()!;
    for (const target of outgoing.get(id) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(id) ?? 0) + 1));
      const rest = (remainingIncoming.get(target) ?? 1) - 1;
      remainingIncoming.set(target, rest);
      if (rest === 0) queue.push(target);
    }
  }
  graph.nodes.forEach((node, index) => { if (!rank.has(node.id)) rank.set(node.id, index % 5); });
  const columns = new Map<number, RuntimeGraphNode[]>();
  for (const node of graph.nodes) {
    const value = rank.get(node.id) ?? 0;
    columns.set(value, [...(columns.get(value) ?? []), node]);
  }
  const maxRows = Math.max(1, ...[...columns.values()].map((items) => items.length));
  const nodes: PositionedNode[] = [];
  for (const [column, items] of [...columns].sort((a, b) => a[0] - b[0])) {
    const offset = ((maxRows - items.length) * (NODE_H + GAP_Y)) / 2;
    items.forEach((node, row) => nodes.push({
      ...node,
      x: 56 + column * (NODE_W + GAP_X),
      y: 72 + offset + row * (NODE_H + GAP_Y),
      w: NODE_W,
      h: NODE_H,
    }));
  }
  return {
    nodes,
    width: Math.max(760, 112 + (Math.max(0, ...columns.keys()) + 1) * (NODE_W + GAP_X)),
    height: Math.max(460, 144 + maxRows * (NODE_H + GAP_Y)),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function metricLabel(measure: RuntimeMeasure): string {
  return ({ requests: "Requests", errors: "Error rate", latencyP95: "p95 latency", throughput: "Throughput", saturation: "Saturation" })[measure];
}

function metricText(node: RuntimeGraphNode, measure: RuntimeMeasure): string {
  const metric = node.metrics[measure] ?? (measure === "errors" ? node.metrics.errorRate : measure === "requests" ? node.metrics.requestRate : undefined);
  return metric ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}` : "No data";
}

function edgeWidth(edge: RuntimeGraphEdge, measure: RuntimeMeasure): number {
  const value = runtimeMetricValue(edge.metrics, measure);
  return value === undefined ? 1.5 : Math.min(7, 1.5 + Math.log10(Math.max(1, value)) * 1.25);
}

function graphSvg(graph: RuntimeGraph, measure: RuntimeMeasure, selected: string | null = null): string {
  const layout = layoutGraph(graph);
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const related = new Set<string>();
  if (selected) {
    related.add(selected);
    graph.edges.forEach((edge) => { if (edge.from === selected || edge.to === selected) { related.add(edge.from); related.add(edge.to); } });
  }
  const edges = graph.edges.map((edge) => {
    const from = byId.get(edge.from); const to = byId.get(edge.to);
    if (!from || !to) return "";
    const x1 = from.x + from.w; const y1 = from.y + from.h / 2;
    const x2 = to.x; const y2 = to.y + to.h / 2;
    const mid = x1 + Math.max(28, (x2 - x1) / 2);
    const faded = selected && edge.from !== selected && edge.to !== selected;
    return `<g class="runtime-edge${faded ? " is-faded" : ""}" data-edge-id="${escapeHtml(edge.id)}"><path d="M${x1},${y1} H${mid} V${y2} H${x2}" style="--edge-width:${edgeWidth(edge, measure)}" marker-end="url(#runtime-arrow)"/><title>${escapeHtml(edge.label ?? edge.protocol ?? edge.id)}</title></g>`;
  }).join("");
  const nodes = layout.nodes.map((node) => {
    const value = metricText(node, measure);
    const faded = selected && !related.has(node.id);
    return `<g class="runtime-node health-${node.health}${faded ? " is-faded" : ""}${selected === node.id ? " is-selected" : ""}" data-node-id="${escapeHtml(node.id)}" role="button" tabindex="0" aria-label="${escapeHtml(`${node.label}, ${node.health}, ${value}`)}" transform="translate(${node.x} ${node.y})"><rect width="${node.w}" height="${node.h}" rx="7"/><circle class="health-ring" cx="21" cy="22" r="8"/><text class="node-title" x="38" y="27">${escapeHtml(node.label)}</text><text class="node-kind" x="16" y="49">${escapeHtml(node.kind ?? "service")}</text><text class="node-metric" x="16" y="76">${escapeHtml(value)}</text><text class="node-source" x="${node.w - 12}" y="77" text-anchor="end">${escapeHtml(node.source)}</text></g>`;
  }).join("");
  return `<svg class="archmap-runtime-graph" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg"><defs><style>
    .runtime-edge path{fill:none;stroke:#728399;stroke-width:var(--edge-width);vector-effect:non-scaling-stroke}.runtime-edge.is-faded{opacity:.12}
    .runtime-node rect{fill:#fff;stroke:#9aa9ba;stroke-width:1.5}.runtime-node .health-ring{fill:none;stroke:#94a3b8;stroke-width:4}.runtime-node.health-normal .health-ring{stroke:#26a269}.runtime-node.health-warning .health-ring{stroke:#d59b22}.runtime-node.health-critical .health-ring{stroke:#d64242}.runtime-node.health-no-data .health-ring{stroke-dasharray:2 2}.runtime-node.is-selected rect{stroke:#2563eb;stroke-width:3}.runtime-node.is-faded{opacity:.16}.node-title{font:700 13px system-ui,sans-serif;fill:#172536}.node-kind,.node-source{font:10px system-ui,sans-serif;fill:#64748b}.node-metric{font:700 17px system-ui,sans-serif;fill:#172536}#runtime-arrow path{fill:#728399}
  </style><marker id="runtime-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7Z"/></marker></defs><g class="runtime-world">${edges}${nodes}</g></svg>`;
}

function svgToPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth);
      canvas.height = Math.max(1, image.naturalHeight);
      const context = canvas.getContext("2d");
      if (!context) { URL.revokeObjectURL(url); reject(new Error("Canvas 2D is unavailable.")); return; }
      context.fillStyle = "#f8fafc";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Runtime SVG could not be rasterized.")); };
    image.src = url;
  });
}

function download(content: BlobPart, type: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

function style(): string {
  return `<style>
  .archmap-runtime{position:relative;display:grid;grid-template:44px minmax(0,1fr) 104px / minmax(0,1fr) 280px;min-height:620px;height:100%;background:#f5f7fa;color:#172536;font:13px system-ui,sans-serif;overflow:hidden}
  .runtime-query{grid-column:1/3;display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff;border-bottom:1px solid #d8dee8;z-index:3}.runtime-query label{font-size:11px;color:#64748b}.runtime-query select,.runtime-query input,.runtime-query button{height:30px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:0 8px;color:#24354b}.runtime-query input{min-width:170px}.runtime-query .spacer{flex:1}.runtime-query button{cursor:pointer}.runtime-query button:hover{background:#eef4fb}
  .runtime-stage{position:relative;overflow:hidden;cursor:grab;background:#f8fafc}.runtime-stage.is-panning{cursor:grabbing}.runtime-stage svg{position:absolute;left:0;top:0;overflow:visible;transform-origin:0 0}.runtime-world{transform-origin:0 0}
  .runtime-inspector{grid-column:2;grid-row:2;padding:16px;background:#fff;border-left:1px solid #d8dee8;overflow:auto}.runtime-inspector h2{font-size:16px;margin:0 0 4px}.runtime-inspector .muted{color:#64748b}.runtime-inspector dl{display:grid;grid-template-columns:92px 1fr;gap:8px;margin-top:18px}.runtime-inspector dt{color:#64748b}.runtime-inspector dd{margin:0;overflow-wrap:anywhere}.runtime-inspector .health{font-weight:700}
  .runtime-timeline{grid-column:1/3;display:flex;gap:16px;align-items:flex-start;padding:10px 14px;background:#fff;border-top:1px solid #d8dee8;overflow:auto}.runtime-event{min-width:180px;border-left:3px solid #64748b;padding-left:9px}.runtime-event strong{display:block}.runtime-event span{color:#64748b;font-size:11px}
  .runtime-minimap{position:absolute;right:294px;bottom:118px;width:160px;height:96px;background:#ffffffdf;border:1px solid #cbd5e1;border-radius:5px;overflow:hidden;pointer-events:none;z-index:2}.runtime-minimap svg{width:100%;height:100%;position:static}
  .runtime-edge path{fill:none;stroke:#728399;stroke-width:var(--edge-width);vector-effect:non-scaling-stroke}.runtime-edge.is-faded{opacity:.12}.runtime-node{cursor:pointer;transition:opacity .12s}.runtime-node rect{fill:#fff;stroke:#9aa9ba;stroke-width:1.5}.runtime-node .health-ring{fill:none;stroke:#94a3b8;stroke-width:4}.runtime-node.health-normal .health-ring{stroke:#26a269}.runtime-node.health-warning .health-ring{stroke:#d59b22}.runtime-node.health-critical .health-ring{stroke:#d64242}.runtime-node.health-no-data .health-ring{stroke-dasharray:2 2}.runtime-node.is-selected rect{stroke:#2563eb;stroke-width:3}.runtime-node.is-faded{opacity:.16}.node-title{font-weight:700;font-size:13px;fill:#172536}.node-kind,.node-source{font-size:10px;fill:#64748b}.node-metric{font-size:17px;font-weight:700;fill:#172536}#runtime-arrow path{fill:#728399}
  .runtime-empty{position:absolute;inset:0;display:grid;place-items:center;color:#64748b;pointer-events:none}.runtime-legend{display:flex;gap:9px;align-items:center;color:#64748b;font-size:11px}.runtime-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}.runtime-legend .ok{background:#26a269}.runtime-legend .warn{background:#d59b22}.runtime-legend .bad{background:#d64242}
  @media(max-width:800px){.archmap-runtime{grid-template-columns:1fr;grid-template-rows:auto minmax(480px,1fr) auto auto}.runtime-query{grid-column:1;flex-wrap:wrap;height:auto}.runtime-inspector{grid-column:1;grid-row:3;border-left:0;border-top:1px solid #d8dee8}.runtime-timeline{grid-column:1;grid-row:4}.runtime-minimap{right:12px;bottom:230px}}
  </style>`;
}

export function runtimeView(ctx: ViewContext): MountableView {
  return { mount(target: Element): ViewHandle {
    let mode: RuntimeGraphMode = "runtime";
    let measure: RuntimeMeasure = "requests";
    let groupBy: RuntimeGroupBy = "none";
    let selected: string | null = null;
    let scale = 1; let tx = 20; let ty = 20; let panning = false; let lastX = 0; let lastY = 0;
    const root = document.createElement("div"); root.className = "archmap-runtime";
    target.replaceChildren(root);

    const currentGraph = (): RuntimeGraph => projectRuntimeGraph(buildRuntimeGraph(ctx.model, mode), groupBy, groupBy === "none" ? Number.POSITIVE_INFINITY : 80);
    const render = (): void => {
      const graph = currentGraph();
      const selectedNode = graph.nodes.find((node) => node.id === selected);
      root.innerHTML = `${style()}<div class="runtime-query">
        <label>Graph <select data-control="mode"><option value="design">Design</option><option value="runtime">Runtime</option><option value="diff">Diff</option></select></label>
        <label>Measure <select data-control="measure"><option value="requests">Requests</option><option value="errors">Errors</option><option value="latencyP95">p95 latency</option><option value="throughput">Throughput</option><option value="saturation">Saturation</option></select></label>
        <label>Group <select data-control="group"><option value="none">None</option><option value="environment">Environment</option><option value="team">Team</option><option value="region">Region</option><option value="zone">Zone</option></select></label>
        <label>Filter <input data-control="filter" type="search" placeholder="service or kind"/></label><div class="runtime-legend"><i class="ok"></i>healthy <i class="warn"></i>degraded <i class="bad"></i>critical</div><span class="spacer"></span>
        <button data-export="json" title="Export runtime snapshot as JSON">JSON</button><button data-export="csv" title="Export runtime dependencies as CSV">CSV</button><button data-export="svg" title="Export Runtime View as SVG">SVG</button></div>
        <div class="runtime-stage">${graphSvg(graph, measure, selected)}${graph.nodes.length ? "" : `<div class="runtime-empty">No runtime snapshot is declared in this ArchMap document.</div>`}</div>
        <aside class="runtime-inspector">${selectedNode ? `<h2>${escapeHtml(selectedNode.label)}</h2><div class="muted">${escapeHtml(selectedNode.id)}</div><dl><dt>Health</dt><dd class="health">${escapeHtml(selectedNode.health)}</dd><dt>${escapeHtml(metricLabel(measure))}</dt><dd>${escapeHtml(metricText(selectedNode, measure))}</dd><dt>Source</dt><dd>${escapeHtml(selectedNode.source)}</dd><dt>Environment</dt><dd>${escapeHtml(selectedNode.environment ?? "-")}</dd><dt>Team</dt><dd>${escapeHtml(selectedNode.team ?? "-")}</dd><dt>Region</dt><dd>${escapeHtml(selectedNode.region ?? "-")}</dd><dt>Diff</dt><dd>${escapeHtml(selectedNode.diff)}</dd></dl>` : `<h2>Runtime inspector</h2><p class="muted">Select a service to highlight its immediate dependencies and inspect the authored snapshot.</p>`}</aside>
        <div class="runtime-timeline">${graph.events.length ? graph.events.map((event) => `<div class="runtime-event"><strong>${escapeHtml(event.label ?? event.type ?? event.id)}</strong><span>${escapeHtml(event.at ?? "time not declared")} · ${escapeHtml(event.severity ?? "info")}</span></div>`).join("") : `<span class="muted">No runtime events declared.</span>`}</div>
        <div class="runtime-minimap">${graphSvg(graph, measure)}</div>`;
      (root.querySelector('[data-control="mode"]') as HTMLSelectElement).value = mode;
      (root.querySelector('[data-control="measure"]') as HTMLSelectElement).value = measure;
      (root.querySelector('[data-control="group"]') as HTMLSelectElement).value = groupBy;
      applyTransform();
    };
    const applyTransform = (): void => {
      const world = root.querySelector(".runtime-world") as SVGGElement | null;
      if (world) world.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    };
    const fit = (): void => {
      const stage = root.querySelector(".runtime-stage") as HTMLElement | null;
      const svg = root.querySelector(".runtime-stage svg") as SVGSVGElement | null;
      if (!stage || !svg) return;
      const box = svg.viewBox.baseVal; scale = Math.min(1, (stage.clientWidth - 40) / box.width, (stage.clientHeight - 40) / box.height);
      tx = Math.max(20, (stage.clientWidth - box.width * scale) / 2); ty = Math.max(20, (stage.clientHeight - box.height * scale) / 2); applyTransform();
    };
    const onChange = (event: Event): void => {
      const el = event.target as HTMLSelectElement;
      const control = el.dataset.control;
      if (control === "mode") mode = el.value as RuntimeGraphMode;
      if (control === "measure") measure = el.value as RuntimeMeasure;
      if (control === "group") groupBy = el.value as RuntimeGroupBy;
      if (control !== "filter") render();
    };
    const onInput = (event: Event): void => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.control !== "filter") return;
      const query = input.value.toLowerCase();
      root.querySelectorAll<SVGGElement>(".runtime-node").forEach((node) => {
        node.style.display = !query || node.textContent?.toLowerCase().includes(query) ? "" : "none";
      });
    };
    const onClick = (event: Event): void => {
      const targetEl = event.target as Element;
      const node = targetEl.closest<SVGGElement>("[data-node-id]");
      if (node) { selected = selected === node.dataset.nodeId ? null : node.dataset.nodeId ?? null; render(); return; }
      const exportButton = targetEl.closest<HTMLButtonElement>("[data-export]");
      if (exportButton) {
        const graph = currentGraph(); const kind = exportButton.dataset.export;
        if (kind === "json") download(runtimeGraphToJson(graph), "application/json", "archmap-runtime.json");
        if (kind === "csv") download(runtimeGraphToCsv(graph), "text/csv", "archmap-runtime.csv");
        if (kind === "svg") download(graphSvg(graph, measure), "image/svg+xml", "archmap-runtime.svg");
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const node = (event.target as Element).closest<SVGGElement>("[data-node-id]");
      if (!node) return;
      event.preventDefault();
      selected = selected === node.dataset.nodeId ? null : node.dataset.nodeId ?? null;
      render();
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault(); const stage = root.querySelector(".runtime-stage") as HTMLElement | null; if (!stage) return;
      const rect = stage.getBoundingClientRect(); const px = event.clientX - rect.left; const py = event.clientY - rect.top;
      const next = Math.max(.2, Math.min(2.8, scale * Math.exp(-event.deltaY * .0015)));
      tx = px - (px - tx) * (next / scale); ty = py - (py - ty) * (next / scale); scale = next; applyTransform();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if ((event.target as Element).closest(".runtime-node")) return;
      panning = true; lastX = event.clientX; lastY = event.clientY; (event.currentTarget as Element).setPointerCapture(event.pointerId); root.querySelector(".runtime-stage")?.classList.add("is-panning");
    };
    const onPointerMove = (event: PointerEvent): void => { if (!panning) return; tx += event.clientX - lastX; ty += event.clientY - lastY; lastX = event.clientX; lastY = event.clientY; applyTransform(); };
    const onPointerUp = (): void => { panning = false; root.querySelector(".runtime-stage")?.classList.remove("is-panning"); };
    root.addEventListener("change", onChange); root.addEventListener("input", onInput); root.addEventListener("click", onClick); root.addEventListener("keydown", onKeyDown);
    root.addEventListener("wheel", onWheel, { passive: false }); root.addEventListener("pointerdown", onPointerDown); root.addEventListener("pointermove", onPointerMove); root.addEventListener("pointerup", onPointerUp); root.addEventListener("pointercancel", onPointerUp);
    render(); requestAnimationFrame(fit);
    return {
      dispose(): void { root.remove(); },
      exportPng(): Promise<Blob> { return svgToPng(graphSvg(currentGraph(), measure, selected)); },
    };
  }};
}
