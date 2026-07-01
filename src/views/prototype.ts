import type { ArchEdge, ArchMapModel, ArchNode, DataObject, Diagnostic, Scenario } from "../types.js";
import type { MountableView, ViewContext, ViewHandle } from "../render.js";
import { buildEdgePaths } from "./svg.js";

const SCREEN_KINDS = new Set([
  "screen", "page", "modal", "webview", "form", "external_page", "error_screen", "completion_screen",
]);

function isScreenNode(node: ArchNode): boolean {
  return !!node.image || (node.kind !== undefined && SCREEN_KINDS.has(node.kind));
}

function isSafeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  return !scheme || scheme === "http" || scheme === "https" || scheme === "blob";
}

function button(label: string, className: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  return el;
}

function edgeLabel(edge: ArchEdge): string {
  return edge.label || edge.trigger || edge.flow || `${edge.from} -> ${edge.to}`;
}

function scenarioById(model: ArchMapModel, id: string | undefined): Scenario | undefined {
  return id ? model.scenarios.find((scenario) => scenario.id === id) : undefined;
}

function edgeResolver(model: ArchMapModel): (ref: string) => ArchEdge | undefined {
  const byId = new Map(model.edges.map((edge) => [edge.id, edge]));
  const byPair = new Map<string, ArchEdge[]>();
  for (const edge of model.edges) {
    const key = edge.pairKey ?? `${edge.from}->${edge.to}`;
    byPair.set(key, [...(byPair.get(key) ?? []), edge]);
  }
  return (ref: string): ArchEdge | undefined => byId.get(ref) ?? (byPair.get(ref)?.length === 1 ? byPair.get(ref)![0] : undefined);
}

function initialScreen(model: ArchMapModel, scenarioId: string | undefined): string | undefined {
  const requested = scenarioById(model, scenarioId);
  if (requested?.start) return requested.start;
  const viewDefault = typeof model.view?.default === "object" ? model.view.default as { prototype?: { scenario?: string } } : undefined;
  const metadataScenario = scenarioById(model, viewDefault?.prototype?.scenario);
  if (metadataScenario?.start) return metadataScenario.start;
  const firstScenario = model.scenarios[0];
  if (firstScenario?.start) return firstScenario.start;
  const incoming = new Set(model.edges.map((edge) => edge.to));
  const rootScreen = model.nodes.find((node) => isScreenNode(node) && !incoming.has(node.id));
  if (rootScreen) return rootScreen.id;
  return model.nodes.find(isScreenNode)?.id ?? model.nodes[0]?.id;
}

function relatedDiagnostics(model: ArchMapModel, screenId: string, outgoing: ArchEdge[], scenarioId: string | null): Diagnostic[] {
  const outgoingIds = new Set(outgoing.map((edge) => edge.id));
  return model.diagnostics.filter((entry) => {
    if (entry.target?.type === "node" && entry.target.id === screenId) return true;
    if (entry.target?.type === "edge" && outgoingIds.has(entry.target.id)) return true;
    if (entry.target?.type === "view" && scenarioId && entry.target.id === scenarioId) return true;
    return false;
  });
}

function dataForEdges(model: ArchMapModel, edges: ArchEdge[]): DataObject[] {
  const ids = new Set(edges.flatMap((edge) => edge.dataIds ?? []));
  return model.data.filter((entry) => ids.has(entry.id));
}

function emit(target: Element, name: string, detail: Record<string, unknown>): void {
  target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

interface FlowMapNode {
  node: ArchNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  row: number;
}

type FlowMapSide = "left" | "right" | "top" | "bottom";

interface FlowMapEndpointPlan {
  edge: ArchEdge;
  from: FlowMapNode;
  to: FlowMapNode;
  sourceSide: FlowMapSide;
  targetSide: FlowMapSide;
  laneOrdinal: number;
}

function screenNodes(model: ArchMapModel): ArchNode[] {
  const screens = model.nodes.filter(isScreenNode);
  return screens.length > 0 ? screens : model.nodes;
}

function scenarioOrder(model: ArchMapModel, scenario: Scenario | undefined): Map<string, number> {
  const order = new Map<string, number>();
  if (scenario) {
    order.set(scenario.start, 0);
    const resolve = edgeResolver(model);
    scenario.steps.forEach((ref, index) => {
      const edge = resolve(ref);
      if (edge) order.set(edge.to, index + 1);
    });
  }
  model.nodes.forEach((node, index) => {
    if (!order.has(node.id)) order.set(node.id, index + 1000);
  });
  return order;
}

function flowMapLayout(model: ArchMapModel, scenario: Scenario | undefined): { nodes: FlowMapNode[]; width: number; height: number } {
  const screens = screenNodes(model);
  const screenIds = new Set(screens.map((node) => node.id));
  const transitions = model.edges.filter((edge) => screenIds.has(edge.from) && screenIds.has(edge.to));
  const outgoingByNode = new Map<string, ArchEdge[]>();
  for (const edge of transitions) {
    const bucket = outgoingByNode.get(edge.from);
    if (bucket) bucket.push(edge);
    else outgoingByNode.set(edge.from, [edge]);
  }
  const incoming = new Set(transitions.map((edge) => edge.to));
  const roots = scenario?.start && screenIds.has(scenario.start)
    ? [scenario.start]
    : screens.filter((node) => !incoming.has(node.id)).map((node) => node.id);
  if (roots.length === 0 && screens[0]) roots.push(screens[0].id);

  const depth = new Map<string, number>();
  const queue = [...roots];
  for (const root of roots) depth.set(root, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextDepth = (depth.get(current) ?? 0) + 1;
    for (const edge of outgoingByNode.get(current) ?? []) {
      const existing = depth.get(edge.to);
      if (existing === undefined || nextDepth < existing) {
        depth.set(edge.to, nextDepth);
        queue.push(edge.to);
      }
    }
  }
  for (const node of screens) {
    if (!depth.has(node.id)) depth.set(node.id, Math.max(0, depth.size));
  }

  const order = scenarioOrder(model, scenario);
  const columns = new Map<number, ArchNode[]>();
  for (const node of screens) {
    const d = depth.get(node.id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), node]);
  }

  const cardW = 210;
  const cardH = 260;
  const xGap = 180;
  const yGap = 72;
  const margin = 120;
  const placed: FlowMapNode[] = [];
  const sortedDepths = [...columns.keys()].sort((a, b) => a - b);
  const rowById = new Map<string, number>();
  for (const d of sortedDepths) {
    const nodes = [...(columns.get(d) ?? [])].sort((a, b) => {
      const incomingMedian = (node: ArchNode): number => {
        const incomingRows = transitions
          .filter((edge) => edge.to === node.id)
          .map((edge) => rowById.get(edge.from))
          .filter((row): row is number => row !== undefined)
          .sort((x, y) => x - y);
        return incomingRows.length ? incomingRows[Math.floor(incomingRows.length / 2)] : Number.POSITIVE_INFINITY;
      };
      return incomingMedian(a) - incomingMedian(b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.label.localeCompare(b.label);
    });
    nodes.forEach((node, index) => {
      rowById.set(node.id, index);
      placed.push({
        node,
        x: margin + d * (cardW + xGap),
        y: margin + index * (cardH + yGap),
        w: cardW,
        h: cardH,
        depth: d,
        row: index,
      });
    });
  }
  const maxDepth = Math.max(0, ...sortedDepths);
  const maxRows = Math.max(1, ...[...columns.values()].map((nodes) => nodes.length));
  return {
    nodes: placed,
    width: margin * 2 + (maxDepth + 1) * cardW + maxDepth * xGap,
    height: margin * 2 + maxRows * cardH + (maxRows - 1) * yGap,
  };
}

function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
}

function flowMapSides(from: FlowMapNode, to: FlowMapNode): { sourceSide: FlowMapSide; targetSide: FlowMapSide } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  if (from.depth !== to.depth) {
    return from.depth < to.depth
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }
  return dy >= 0
    ? { sourceSide: "bottom", targetSide: "top" }
    : { sourceSide: "top", targetSide: "bottom" };
}

function sidePoint(node: FlowMapNode, side: FlowMapSide, ordinal: number, total: number): { x: number; y: number } {
  const along = total <= 1 ? 0.5 : (ordinal + 1) / (total + 1);
  if (side === "left" || side === "right") {
    return {
      x: side === "left" ? node.x : node.x + node.w,
      y: node.y + node.h * along,
    };
  }
  return {
    x: node.x + node.w * along,
    y: side === "top" ? node.y : node.y + node.h,
  };
}

function endpointKey(nodeId: string, side: FlowMapSide): string {
  return `${nodeId}:${side}`;
}

function endpointSort(plan: FlowMapEndpointPlan, nodeId: string): number {
  const other = plan.edge.from === nodeId ? plan.to : plan.from;
  return other.y * 100000 + other.x;
}

function routeLaneKey(plan: FlowMapEndpointPlan): string {
  const sourceHorizontal = plan.sourceSide === "left" || plan.sourceSide === "right";
  const targetHorizontal = plan.targetSide === "left" || plan.targetSide === "right";
  if (sourceHorizontal && targetHorizontal) {
    const lo = Math.min(plan.from.depth, plan.to.depth);
    const hi = Math.max(plan.from.depth, plan.to.depth);
    const dir = plan.from.depth <= plan.to.depth ? "forward" : "back";
    return `x:${dir}:${lo}:${hi}`;
  }
  if (!sourceHorizontal && !targetHorizontal) {
    const lo = Math.min(plan.from.row, plan.to.row);
    const hi = Math.max(plan.from.row, plan.to.row);
    const dir = plan.from.row <= plan.to.row ? "down" : "up";
    return `y:${dir}:${lo}:${hi}:${plan.from.depth}`;
  }
  return `mixed:${plan.edge.id}:${plan.from.node.id}:${plan.to.node.id}`;
}

function sideNormal(side: FlowMapSide): { x: number; y: number } {
  if (side === "left") return { x: -1, y: 0 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function addPoint(points: Array<{ x: number; y: number }>, point: { x: number; y: number }): void {
  const last = points[points.length - 1];
  if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) return;
  points.push(point);
}

function simplifyFlowPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const deduped: Array<{ x: number; y: number }> = [];
  for (const point of points) addPoint(deduped, point);
  return deduped.filter((point, index) => {
    if (index === 0 || index === deduped.length - 1) return true;
    const prev = deduped[index - 1];
    const next = deduped[index + 1];
    const sameX = Math.abs(prev.x - point.x) < 0.5 && Math.abs(point.x - next.x) < 0.5;
    const sameY = Math.abs(prev.y - point.y) < 0.5 && Math.abs(point.y - next.y) < 0.5;
    return !(sameX || sameY);
  });
}

function segmentIntersectsFlowNode(a: { x: number; y: number }, b: { x: number; y: number }, node: FlowMapNode, padding = 10): boolean {
  const x0 = node.x - padding;
  const y0 = node.y - padding;
  const x1 = node.x + node.w + padding;
  const y1 = node.y + node.h + padding;
  if (Math.max(a.x, b.x) <= x0 || Math.min(a.x, b.x) >= x1 || Math.max(a.y, b.y) <= y0 || Math.min(a.y, b.y) >= y1) return false;
  if (Math.abs(a.x - b.x) < 0.5) return a.x > x0 && a.x < x1 && Math.max(a.y, b.y) > y0 && Math.min(a.y, b.y) < y1;
  if (Math.abs(a.y - b.y) < 0.5) return a.y > y0 && a.y < y1 && Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1;
  return false;
}

function flowRouteHits(points: Array<{ x: number; y: number }>, from: FlowMapNode, to: FlowMapNode, nodes: FlowMapNode[]): number {
  const blockers = nodes.filter((node) => node.node.id !== from.node.id && node.node.id !== to.node.id);
  let hits = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const node of blockers) {
      if (segmentIntersectsFlowNode(points[i], points[i + 1], node)) hits++;
    }
  }
  return hits;
}

function flowRouteLength(points: Array<{ x: number; y: number }>): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.abs(points[i].x - points[i + 1].x) + Math.abs(points[i].y - points[i + 1].y);
  }
  return length;
}

function routeFlowMapEdge(
  start: { x: number; y: number },
  end: { x: number; y: number },
  sourceSide: FlowMapSide,
  targetSide: FlowMapSide,
  laneOrdinal: number,
): Array<{ x: number; y: number }> {
  const laneGap = 22;
  const stub = 42;
  const detour = 70;
  const source = sideNormal(sourceSide);
  const target = sideNormal(targetSide);
  const startOuter = { x: start.x + source.x * stub, y: start.y + source.y * stub };
  const endOuter = { x: end.x + target.x * stub, y: end.y + target.y * stub };
  const sourceHorizontal = sourceSide === "left" || sourceSide === "right";
  const targetHorizontal = targetSide === "left" || targetSide === "right";
  const route: Array<{ x: number; y: number }> = [];
  addPoint(route, start);
  addPoint(route, startOuter);

  if (Math.abs(startOuter.x - endOuter.x) < 0.5 || Math.abs(startOuter.y - endOuter.y) < 0.5) {
    addPoint(route, endOuter);
  } else if (sourceHorizontal !== targetHorizontal) {
    addPoint(route, sourceHorizontal ? { x: endOuter.x, y: startOuter.y } : { x: startOuter.x, y: endOuter.y });
    addPoint(route, endOuter);
  } else if (sourceHorizontal) {
    let midX = (startOuter.x + endOuter.x) / 2 + laneOrdinal * laneGap;
    if (sourceSide === "right" && endOuter.x < startOuter.x) midX = Math.max(startOuter.x, endOuter.x) + detour + laneOrdinal * laneGap;
    if (sourceSide === "left" && endOuter.x > startOuter.x) midX = Math.min(startOuter.x, endOuter.x) - detour + laneOrdinal * laneGap;
    addPoint(route, { x: midX, y: startOuter.y });
    addPoint(route, { x: midX, y: endOuter.y });
    addPoint(route, endOuter);
  } else {
    let midY = (startOuter.y + endOuter.y) / 2 + laneOrdinal * laneGap;
    if (sourceSide === "bottom" && endOuter.y < startOuter.y) midY = Math.max(startOuter.y, endOuter.y) + detour + laneOrdinal * laneGap;
    if (sourceSide === "top" && endOuter.y > startOuter.y) midY = Math.min(startOuter.y, endOuter.y) - detour + laneOrdinal * laneGap;
    addPoint(route, { x: startOuter.x, y: midY });
    addPoint(route, { x: endOuter.x, y: midY });
    addPoint(route, endOuter);
  }
  addPoint(route, end);
  return simplifyFlowPoints(route);
}

function repairFlowMapRoute(
  points: Array<{ x: number; y: number }>,
  plan: FlowMapEndpointPlan,
  nodes: FlowMapNode[],
): Array<{ x: number; y: number }> {
  if (flowRouteHits(points, plan.from, plan.to, nodes) === 0) return points;
  const source = sideNormal(plan.sourceSide);
  const target = sideNormal(plan.targetSide);
  const start = points[0];
  const end = points[points.length - 1];
  const startOuter = { x: start.x + source.x * 42, y: start.y + source.y * 42 };
  const endOuter = { x: end.x + target.x * 42, y: end.y + target.y * 42 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  const laneGap = 36;
  const laneIndex = Math.round(plan.laneOrdinal);
  const outsideTop = minY - 72 - Math.max(0, -laneIndex) * laneGap;
  const outsideBottom = maxY + 72 + Math.max(0, laneIndex) * laneGap;
  const outsideLeft = minX - 72 - Math.max(0, -laneIndex) * laneGap;
  const outsideRight = maxX + 72 + Math.max(0, laneIndex) * laneGap;
  const sourceHorizontal = plan.sourceSide === "left" || plan.sourceSide === "right";
  const targetHorizontal = plan.targetSide === "left" || plan.targetSide === "right";
  const candidates: Array<Array<{ x: number; y: number }>> = [points];
  const candidate = (middle: Array<{ x: number; y: number }>): void => {
    candidates.push(simplifyFlowPoints([start, startOuter, ...middle, endOuter, end]));
  };

  if (sourceHorizontal && targetHorizontal) {
    candidate([{ x: startOuter.x, y: outsideTop }, { x: endOuter.x, y: outsideTop }]);
    candidate([{ x: startOuter.x, y: outsideBottom }, { x: endOuter.x, y: outsideBottom }]);
  } else if (!sourceHorizontal && !targetHorizontal) {
    candidate([{ x: outsideLeft, y: startOuter.y }, { x: outsideLeft, y: endOuter.y }]);
    candidate([{ x: outsideRight, y: startOuter.y }, { x: outsideRight, y: endOuter.y }]);
  } else {
    candidate([{ x: endOuter.x, y: startOuter.y }]);
    candidate([{ x: startOuter.x, y: endOuter.y }]);
    candidate([{ x: startOuter.x, y: outsideTop }, { x: endOuter.x, y: outsideTop }]);
    candidate([{ x: outsideRight, y: startOuter.y }, { x: outsideRight, y: endOuter.y }]);
  }

  return candidates
    .filter((route) => route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    .sort((a, b) => flowRouteHits(a, plan.from, plan.to, nodes) - flowRouteHits(b, plan.from, plan.to, nodes) || flowRouteLength(a) - flowRouteLength(b))[0];
}

function pathD(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

export function prototypeView({ model, options }: ViewContext): MountableView {
  return {
    mount(target: Element): ViewHandle {
      const root = document.createElement("div");
      root.className = "archmap-prototype";
      root.style.cssText =
        "display:grid;grid-template-columns:minmax(280px,1fr) 280px;gap:16px;width:100%;height:100%;min-height:640px;" +
        "box-sizing:border-box;padding:16px;background:#f8fafc;color:#172033;font:13px system-ui,sans-serif;overflow:auto;position:relative;";
      const style = document.createElement("style");
      style.textContent = [
        ".archmap-prototype *{box-sizing:border-box}",
        ".archmap-prototype-screen{min-height:360px;display:flex;align-items:center;justify-content:center;border:1px solid #cbd5e1;border-radius:8px;background:#fff;position:relative;overflow:hidden}",
        ".archmap-prototype-screen img{max-width:100%;max-height:100%;object-fit:contain;display:block}",
        ".archmap-prototype-card{min-width:240px;max-width:520px;border:2px solid #315b92;border-radius:8px;padding:28px;background:#eef6ff;text-align:center}",
        ".archmap-prototype-title{font-size:22px;font-weight:800;margin-bottom:8px}",
        ".archmap-prototype-meta{color:#55657d}",
        ".archmap-prototype-hotspot{position:absolute;border:2px solid #2563eb;background:rgba(37,99,235,.14);border-radius:6px;cursor:pointer}",
        ".archmap-prototype-panel{display:flex;flex-direction:column;gap:12px}",
        ".archmap-prototype.is-map .archmap-prototype-panel{position:absolute;right:28px;top:28px;width:280px;max-height:calc(100% - 56px);overflow:auto;z-index:6;padding:10px;border:1px solid rgba(148,163,184,.65);border-radius:10px;background:rgba(248,250,252,.90);box-shadow:0 12px 28px rgba(15,23,42,.16);backdrop-filter:blur(5px)}",
        ".archmap-prototype-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
        ".archmap-prototype button,.archmap-prototype select{border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#172033;padding:7px 9px;font:600 12px system-ui,sans-serif}",
        ".archmap-prototype button{cursor:pointer}",
        ".archmap-prototype button[aria-pressed='true']{background:#dbeafe;border-color:#6b93ca;color:#163b68}",
        ".archmap-prototype-transition{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left}",
        ".archmap-prototype-badge{display:inline-flex;border-radius:999px;background:#e2e8f0;color:#334155;padding:2px 7px;font-size:11px;font-weight:700}",
        ".archmap-prototype-warning{color:#92400e;font-weight:700}",
        ".archmap-prototype-error{color:#991b1b;font-weight:800}",
        ".archmap-prototype-card-panel{border:1px solid #d7dee9;border-radius:8px;background:#fff;padding:10px}",
        ".archmap-prototype-card-panel h3{margin:0 0 8px;font-size:13px}",
        ".archmap-prototype-card-panel ul{margin:0;padding-left:18px}",
        ".archmap-prototype-flow{width:100%;height:100%;min-height:520px;overflow:hidden;border:0;border-radius:0;background:#fff;position:relative;touch-action:none;cursor:grab}",
        ".archmap-prototype.is-map .archmap-prototype-flow{min-height:100%}",
        ".archmap-prototype-flow.is-dragging{cursor:grabbing}",
        ".archmap-prototype-flow-canvas{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}",
        ".archmap-prototype-flow-svg{position:absolute;inset:0;overflow:visible;pointer-events:none}",
        ".archmap-prototype-flow-card{position:absolute;display:flex;flex-direction:column;border:2px solid #315b92;border-radius:10px;background:#f8fbff;box-shadow:0 2px 7px rgba(15,23,42,.10);overflow:hidden;cursor:pointer}",
        ".archmap-prototype-flow-card.is-current{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.18)}",
        ".archmap-prototype-flow-card img{width:100%;height:202px;object-fit:contain;background:#fff;border-bottom:1px solid #d7dee9}",
        ".archmap-prototype-flow-fallback{height:202px;display:flex;align-items:center;justify-content:center;padding:16px;background:#eef6ff;color:#315b92;font-size:20px;font-weight:800;text-align:center;border-bottom:1px solid #d7dee9}",
        ".archmap-prototype-flow-label{padding:8px 10px;font-weight:800;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".archmap-prototype-flow-kind{padding:0 10px 9px;text-align:center;color:#64748b;font-size:11px;font-weight:700}",
        ".archmap-prototype-flow-edge-label{font:700 12px system-ui,sans-serif;fill:#334155;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}",
        ".archmap-prototype-flow-controls{position:absolute;left:10px;bottom:10px;display:flex;gap:6px;z-index:3}",
        ".archmap-prototype-flow-controls button{padding:6px 8px;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(15,23,42,.14)}",
      ].join("");
      root.appendChild(style);

      const screenPane = document.createElement("div");
      screenPane.className = "archmap-prototype-screen";
      const panel = document.createElement("aside");
      panel.className = "archmap-prototype-panel";
      root.append(screenPane, panel);
      target.innerHTML = "";
      target.appendChild(root);

      const resolveEdge = edgeResolver(model);
      let scenario: Scenario | undefined = scenarioById(model, options.scenario) ?? model.scenarios[0];
      let current = initialScreen(model, scenario?.id);
      let scenarioIndex = 0;
      let showHotspots = options.showHotspots === true;
      let displayMode: "map" | "play" = "map";
      let mapPan = { x: 0, y: 0 };
      let mapZoom = 1;
      let mapInitialized = false;
      let cleanupMapInteractions: (() => void) | undefined;
      let activeMapPointerId: number | undefined;
      const history: string[] = [];

      const currentNode = (): ArchNode | undefined => model.nodes.find((node) => node.id === current);
      const outgoing = (): ArchEdge[] => model.edges.filter((edge) => edge.from === current);
      const transitionByScenarioStep = (): ArchEdge | undefined => {
        if (!scenario) return undefined;
        const ref = scenario.steps[scenarioIndex];
        return ref ? resolveEdge(ref) : undefined;
      };

      const goTo = (screenId: string, via?: ArchEdge): void => {
        if (current && current !== screenId) history.push(current);
        const from = current;
        current = screenId;
        if (scenario && via) {
          const step = scenario.steps.findIndex((ref) => resolveEdge(ref)?.id === via.id);
          if (step >= 0) scenarioIndex = Math.min(step + 1, scenario.steps.length);
        }
        renderUi();
        emit(target, "archmap:prototype-screen-change", { from, to: screenId, edgeId: via?.id, scenario: scenario?.id ?? null });
        if (via) emit(target, "archmap:prototype-transition", { from, to: screenId, edgeId: via.id, scenario: scenario?.id ?? null });
      };

      const selectScenario = (id: string): void => {
        scenario = scenarioById(model, id);
        scenarioIndex = 0;
        history.length = 0;
        current = initialScreen(model, scenario?.id);
        mapInitialized = false;
        renderUi();
        emit(target, "archmap:prototype-scenario-change", { scenario: scenario?.id ?? null, start: current ?? null });
      };

      const renderScreen = (node: ArchNode | undefined, edges: ArchEdge[]): void => {
        screenPane.textContent = "";
        if (!node) {
          const card = document.createElement("div");
          card.className = "archmap-prototype-card";
          card.textContent = "No screen selected.";
          screenPane.appendChild(card);
          return;
        }
        if (node.image && isSafeImageUrl(node.image)) {
          const img = document.createElement("img");
          img.src = node.image;
          img.alt = node.label;
          screenPane.appendChild(img);
        } else {
          const card = document.createElement("div");
          card.className = "archmap-prototype-card";
          const title = document.createElement("div");
          title.className = "archmap-prototype-title";
          title.textContent = node.label;
          const meta = document.createElement("div");
          meta.className = "archmap-prototype-meta";
          meta.textContent = [node.kind, node.zone].filter(Boolean).join(" · ") || node.id;
          card.append(title, meta);
          screenPane.appendChild(card);
        }
        if (!showHotspots || !node.frame?.width || !node.frame.height) return;
        const scaleX = 100 / node.frame.width;
        const scaleY = 100 / node.frame.height;
        for (const edge of edges) {
          if (!edge.hotspot) continue;
          const hotspot = document.createElement("button");
          hotspot.type = "button";
          hotspot.className = "archmap-prototype-hotspot";
          hotspot.title = edgeLabel(edge);
          hotspot.style.left = `${edge.hotspot.x * scaleX}%`;
          hotspot.style.top = `${edge.hotspot.y * scaleY}%`;
          hotspot.style.width = `${edge.hotspot.width * scaleX}%`;
          hotspot.style.height = `${edge.hotspot.height * scaleY}%`;
          hotspot.addEventListener("click", () => {
            emit(target, "archmap:prototype-hotspot-click", { from: edge.from, to: edge.to, edgeId: edge.id, scenario: scenario?.id ?? null });
            goTo(edge.to, edge);
          });
          screenPane.appendChild(hotspot);
        }
      };

      const renderMap = (): void => {
        cleanupMapInteractions?.();
        cleanupMapInteractions = undefined;
        activeMapPointerId = undefined;
        screenPane.textContent = "";
        screenPane.className = "archmap-prototype-flow";
        const mapInteractionController = new AbortController();
        cleanupMapInteractions = () => {
          if (activeMapPointerId !== undefined) {
            try {
              screenPane.releasePointerCapture?.(activeMapPointerId);
            } catch {
              // The pointer may already have been released by the browser.
            }
            activeMapPointerId = undefined;
          }
          screenPane.classList.remove("is-dragging");
          mapInteractionController.abort();
        };
        const map = flowMapLayout(model, scenario);
        const byId = new Map(map.nodes.map((entry) => [entry.node.id, entry]));
        const canvas = document.createElement("div");
        canvas.className = "archmap-prototype-flow-canvas";
        canvas.style.width = `${map.width}px`;
        canvas.style.height = `${map.height}px`;
        const applyMapTransform = (): void => {
          canvas.style.transform = `translate(${mapPan.x.toFixed(1)}px, ${mapPan.y.toFixed(1)}px) scale(${mapZoom.toFixed(3)})`;
        };
        const fitMap = (): void => {
          const bounds = screenPane.getBoundingClientRect();
          const viewportW = Math.max(1, bounds.width);
          const viewportH = Math.max(1, bounds.height);
          mapZoom = Math.min(1, Math.max(0.25, Math.min((viewportW - 56) / map.width, (viewportH - 56) / map.height)));
          mapPan = {
            x: (viewportW - map.width * mapZoom) / 2,
            y: (viewportH - map.height * mapZoom) / 2,
          };
          applyMapTransform();
        };
        const zoomAt = (factor: number, clientX?: number, clientY?: number): void => {
          const bounds = screenPane.getBoundingClientRect();
          const anchorX = clientX === undefined ? bounds.left + bounds.width / 2 : clientX;
          const anchorY = clientY === undefined ? bounds.top + bounds.height / 2 : clientY;
          const localX = anchorX - bounds.left;
          const localY = anchorY - bounds.top;
          const before = { x: (localX - mapPan.x) / mapZoom, y: (localY - mapPan.y) / mapZoom };
          mapZoom = Math.min(2.5, Math.max(0.25, mapZoom * factor));
          mapPan = { x: localX - before.x * mapZoom, y: localY - before.y * mapZoom };
          applyMapTransform();
        };

        const svg = svgEl("svg");
        svg.classList.add("archmap-prototype-flow-svg");
        setAttrs(svg, { width: map.width, height: map.height, viewBox: `0 0 ${map.width} ${map.height}` });
        const defs = svgEl("defs");
        const marker = svgEl("marker");
        setAttrs(marker, { id: "archmap-prototype-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
        const arrow = svgEl("path");
        setAttrs(arrow, { d: "M 0 0 L 10 5 L 0 10 z", fill: "#4f6f9d" });
        marker.appendChild(arrow);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const screenIds = new Set(map.nodes.map((entry) => entry.node.id));
        const mapEdges = model.edges.filter((entry) => screenIds.has(entry.from) && screenIds.has(entry.to));
        const endpointGroups = new Map<string, FlowMapEndpointPlan[]>();
        const plans: FlowMapEndpointPlan[] = [];
        for (const edge of mapEdges) {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) continue;
          const sides = flowMapSides(from, to);
          const plan = { edge, from, to, ...sides, laneOrdinal: 0 };
          plans.push(plan);
          const sourceKey = endpointKey(edge.from, plan.sourceSide);
          const targetKey = endpointKey(edge.to, plan.targetSide);
          const sourceBucket = endpointGroups.get(sourceKey);
          if (sourceBucket) sourceBucket.push(plan);
          else endpointGroups.set(sourceKey, [plan]);
          const targetBucket = endpointGroups.get(targetKey);
          if (targetBucket) targetBucket.push(plan);
          else endpointGroups.set(targetKey, [plan]);
        }
        for (const [key, group] of endpointGroups) {
          const nodeId = key.slice(0, key.indexOf(":"));
          group.sort((a, b) => endpointSort(a, nodeId) - endpointSort(b, nodeId) || a.edge.id.localeCompare(b.edge.id));
        }
        const laneGroups = new Map<string, FlowMapEndpointPlan[]>();
        for (const plan of plans) {
          const key = routeLaneKey(plan);
          const bucket = laneGroups.get(key);
          if (bucket) bucket.push(plan);
          else laneGroups.set(key, [plan]);
        }
        for (const group of laneGroups.values()) {
          group.sort((a, b) => {
            const ay = (a.from.y + a.to.y) / 2;
            const by = (b.from.y + b.to.y) / 2;
            return ay - by || a.edge.id.localeCompare(b.edge.id);
          });
          group.forEach((plan, index) => {
            plan.laneOrdinal = index - (group.length - 1) / 2;
          });
        }
        const edgeRoutes: Array<{ edge: ArchEdge; points: Array<{ x: number; y: number }> }> = [];
        for (const plan of plans) {
          const { edge, from, to } = plan;
          const sourceGroup = endpointGroups.get(endpointKey(edge.from, plan.sourceSide)) ?? [plan];
          const targetGroup = endpointGroups.get(endpointKey(edge.to, plan.targetSide)) ?? [plan];
          const sourceOrdinal = Math.max(0, sourceGroup.indexOf(plan));
          const targetOrdinal = Math.max(0, targetGroup.indexOf(plan));
          const start = sidePoint(from, plan.sourceSide, sourceOrdinal, sourceGroup.length);
          const end = sidePoint(to, plan.targetSide, targetOrdinal, targetGroup.length);
          const points = repairFlowMapRoute(routeFlowMapEdge(start, end, plan.sourceSide, plan.targetSide, plan.laneOrdinal), plan, map.nodes);
          edgeRoutes.push({ edge, points });
        }
        const pathByEdge = buildEdgePaths(edgeRoutes.map(({ edge, points }) => ({ id: edge.id, points })));
        for (const { edge, points } of edgeRoutes) {
          const path = svgEl("path");
          setAttrs(path, {
            d: pathByEdge.get(edge.id) ?? pathD(points),
            fill: "none",
            stroke: edge.boundaryCrossing ? "#d97706" : "#4f6f9d",
            "stroke-width": 2,
            "marker-end": "url(#archmap-prototype-arrow)",
          });
          svg.appendChild(path);
          const label = svgEl("text");
          label.classList.add("archmap-prototype-flow-edge-label");
          label.textContent = edge.trigger ?? edge.label ?? edge.flow ?? "";
          const labelStart = points[0] ?? { x: 0, y: 0 };
          const firstBend = points[1] ?? labelStart;
          const labelX = (labelStart.x + firstBend.x) / 2;
          const labelY = (labelStart.y + firstBend.y) / 2 - 8;
          setAttrs(label, { x: labelX, y: labelY, "text-anchor": "middle" });
          if (label.textContent) svg.appendChild(label);
        }
        canvas.appendChild(svg);

        let dragStart: { pointerId: number; x: number; y: number; panX: number; panY: number } | undefined;
        let didDrag = false;
        screenPane.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          const targetEl = event.target instanceof Element ? event.target : null;
          if (targetEl?.closest("button,select,input,textarea,a,.archmap-prototype-panel,.archmap-prototype-flow-controls")) return;
          dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: mapPan.x, panY: mapPan.y };
          activeMapPointerId = event.pointerId;
          didDrag = false;
          screenPane.classList.add("is-dragging");
          screenPane.setPointerCapture?.(event.pointerId);
          event.preventDefault();
        }, { signal: mapInteractionController.signal });
        screenPane.addEventListener("pointermove", (event) => {
          if (!dragStart || event.pointerId !== dragStart.pointerId) return;
          const dx = event.clientX - dragStart.x;
          const dy = event.clientY - dragStart.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) didDrag = true;
          mapPan = { x: dragStart.panX + dx, y: dragStart.panY + dy };
          applyMapTransform();
          event.preventDefault();
        }, { signal: mapInteractionController.signal });
        const endDrag = (event: PointerEvent): void => {
          if (!dragStart || event.pointerId !== dragStart.pointerId) return;
          dragStart = undefined;
          activeMapPointerId = undefined;
          screenPane.classList.remove("is-dragging");
          try {
            screenPane.releasePointerCapture?.(event.pointerId);
          } catch {
            // The pointer may already have been released by the browser.
          }
        };
        screenPane.addEventListener("pointerup", endDrag, { signal: mapInteractionController.signal });
        screenPane.addEventListener("pointercancel", endDrag, { signal: mapInteractionController.signal });
        screenPane.addEventListener("lostpointercapture", endDrag, { signal: mapInteractionController.signal });
        window.addEventListener("pointerup", endDrag, { signal: mapInteractionController.signal });
        window.addEventListener("blur", () => cleanupMapInteractions?.(), { signal: mapInteractionController.signal });
        screenPane.addEventListener("wheel", (event) => {
          event.preventDefault();
          zoomAt(event.deltaY < 0 ? 1.1 : 0.9, event.clientX, event.clientY);
        }, { passive: false });

        for (const item of map.nodes) {
          const card = document.createElement("button");
          card.type = "button";
          card.className = `archmap-prototype-flow-card${item.node.id === current ? " is-current" : ""}`;
          card.style.left = `${item.x}px`;
          card.style.top = `${item.y}px`;
          card.style.width = `${item.w}px`;
          card.style.height = `${item.h}px`;
          card.title = `Open ${item.node.label}`;
          if (item.node.image && isSafeImageUrl(item.node.image)) {
            const img = document.createElement("img");
            img.src = item.node.image;
            img.alt = item.node.label;
            card.appendChild(img);
          } else {
            const fallback = document.createElement("div");
            fallback.className = "archmap-prototype-flow-fallback";
            fallback.textContent = item.node.label;
            card.appendChild(fallback);
          }
          const label = document.createElement("div");
          label.className = "archmap-prototype-flow-label";
          label.textContent = item.node.label;
          const kind = document.createElement("div");
          kind.className = "archmap-prototype-flow-kind";
          kind.textContent = [item.node.kind, item.node.zone].filter(Boolean).join(" / ") || item.node.id;
          card.append(label, kind);
          card.addEventListener("click", () => {
            if (didDrag) return;
            current = item.node.id;
            displayMode = "play";
            renderUi();
          });
          canvas.appendChild(card);
        }

        const controls = document.createElement("div");
        controls.className = "archmap-prototype-flow-controls";
        controls.addEventListener("pointerdown", (event) => event.stopPropagation());
        const zoomOut = button("−", "archmap-prototype-flow-zoom-out");
        zoomOut.title = "Zoom out";
        zoomOut.addEventListener("click", () => zoomAt(0.85));
        const fit = button("Fit", "archmap-prototype-flow-fit");
        fit.title = "Fit map";
        fit.addEventListener("click", () => {
          mapInitialized = false;
          fitMap();
          mapInitialized = true;
        });
        const zoomIn = button("+", "archmap-prototype-flow-zoom-in");
        zoomIn.title = "Zoom in";
        zoomIn.addEventListener("click", () => zoomAt(1.18));
        controls.append(zoomOut, fit, zoomIn);
        screenPane.appendChild(canvas);
        screenPane.appendChild(controls);
        if (!mapInitialized) {
          requestAnimationFrame(() => {
            fitMap();
            mapInitialized = true;
          });
        } else {
          applyMapTransform();
        }
      };

      const renderUi = (): void => {
        const node = currentNode();
        const edges = outgoing();
        root.classList.toggle("is-map", displayMode === "map");
        root.style.gridTemplateColumns = displayMode === "map" ? "1fr" : "minmax(280px,1fr) 280px";
        root.style.overflow = displayMode === "map" ? "hidden" : "auto";
        if (displayMode === "map") {
          renderMap();
        } else {
          cleanupMapInteractions?.();
          cleanupMapInteractions = undefined;
          screenPane.className = "archmap-prototype-screen";
          renderScreen(node, edges);
        }
        panel.textContent = "";

        const modeRow = document.createElement("div");
        modeRow.className = "archmap-prototype-row";
        const mapButton = button("Map", "archmap-prototype-mode-map");
        mapButton.setAttribute("aria-pressed", String(displayMode === "map"));
        mapButton.addEventListener("click", () => {
          displayMode = "map";
          renderUi();
        });
        const playButton = button("Play", "archmap-prototype-mode-play");
        playButton.setAttribute("aria-pressed", String(displayMode === "play"));
        playButton.addEventListener("click", () => {
          displayMode = "play";
          renderUi();
        });
        modeRow.append(mapButton, playButton);
        panel.appendChild(modeRow);

        const nav = document.createElement("div");
        nav.className = "archmap-prototype-row";
        const backButton = button("Back", "archmap-prototype-back");
        backButton.disabled = history.length === 0;
        backButton.addEventListener("click", () => {
          const previous = history.pop();
          if (!previous) return;
          current = previous;
          renderUi();
          emit(target, "archmap:prototype-screen-change", { from: node?.id, to: previous, edgeId: null, scenario: scenario?.id ?? null });
        });
        const nextButton = button("Next", "archmap-prototype-next");
        nextButton.addEventListener("click", () => {
          const edge = transitionByScenarioStep() ?? edges[0];
          if (edge) goTo(edge.to, edge);
        });
        const resetButton = button("Reset", "archmap-prototype-reset");
        resetButton.addEventListener("click", () => {
          scenarioIndex = 0;
          history.length = 0;
          current = initialScreen(model, scenario?.id);
          renderUi();
        });
        nav.append(backButton, nextButton, resetButton);
        panel.appendChild(nav);

        if (model.scenarios.length > 0) {
          const select = document.createElement("select");
          select.className = "archmap-prototype-scenario";
          for (const item of model.scenarios) {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.label ?? item.id;
            option.selected = item.id === scenario?.id;
            select.appendChild(option);
          }
          select.addEventListener("change", () => selectScenario(select.value));
          panel.appendChild(select);
        }

        const hotspotToggle = button(showHotspots ? "Hide hotspots" : "Show hotspots", "archmap-prototype-hotspots");
        hotspotToggle.addEventListener("click", () => {
          showHotspots = !showHotspots;
          renderUi();
        });
        panel.appendChild(hotspotToggle);

        const transitions = document.createElement("div");
        transitions.className = "archmap-prototype-card-panel";
        const transitionsTitle = document.createElement("h3");
        transitionsTitle.textContent = "Outgoing transitions";
        transitions.appendChild(transitionsTitle);
        for (const edge of edges) {
          const item = button(edgeLabel(edge), "archmap-prototype-transition");
          const targetLabel = model.nodes.find((entry) => entry.id === edge.to)?.label ?? edge.to;
          const badge = document.createElement("span");
          badge.className = "archmap-prototype-badge";
          badge.textContent = edge.trigger ?? edge.flow ?? "transition";
          item.textContent = "";
          item.append(document.createTextNode(targetLabel), badge);
          item.addEventListener("click", () => goTo(edge.to, edge));
          transitions.appendChild(item);
        }
        panel.appendChild(transitions);

        const overlayPanel = document.createElement("div");
        overlayPanel.className = "archmap-prototype-card-panel";
        const overlayTitle = document.createElement("h3");
        overlayTitle.textContent = `Overlays: ${(options.overlays ?? []).join(", ") || "none"}`;
        overlayPanel.appendChild(overlayTitle);
        const overlayList = document.createElement("ul");
        if (options.overlays?.includes("dataflow")) {
          for (const data of dataForEdges(model, edges)) {
            const li = document.createElement("li");
            li.textContent = `dataflow: ${data.label ?? data.id}${data.classification ? ` (${data.classification})` : ""}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("auth")) {
          for (const edge of edges.filter((entry) => entry.auth || entry.flow === "auth_check")) {
            const li = document.createElement("li");
            li.textContent = `auth: ${edge.auth?.token ?? edge.flow ?? edge.id}${edge.auth?.issuer ? ` / issuer ${edge.auth.issuer}` : ""}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("boundary")) {
          for (const edge of edges.filter((entry) => entry.boundaryCrossing)) {
            const li = document.createElement("li");
            li.textContent = `boundary: ${edge.label ?? edge.id}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("permission")) {
          for (const permission of model.permissions.filter((entry) => entry.resource === current || (typeof entry.resource !== "string" && entry.resource.id === current))) {
            const li = document.createElement("li");
            li.textContent = `permission: ${permission.principal} ${permission.action}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("validation")) {
          for (const entry of relatedDiagnostics(model, current ?? "", edges, scenario?.id ?? null)) {
            const li = document.createElement("li");
            li.className = entry.level === "error" ? "archmap-prototype-error" : entry.level === "warning" ? "archmap-prototype-warning" : "";
            li.textContent = `${entry.code}: ${entry.message}`;
            overlayList.appendChild(li);
          }
        }
        overlayPanel.appendChild(overlayList);
        panel.appendChild(overlayPanel);
      };

      renderUi();

      return {
        dispose() {
          cleanupMapInteractions?.();
          root.remove();
        },
        setScenario: selectScenario,
        getScenario: () => scenario?.id ?? null,
        goToScreen: (id: string) => {
          if (model.nodes.some((node) => node.id === id)) goTo(id);
        },
        getCurrentScreen: () => current ?? null,
        next: () => {
          const edge = transitionByScenarioStep() ?? outgoing()[0];
          if (edge) goTo(edge.to, edge);
        },
        back: () => {
          const previous = history.pop();
          if (!previous) return;
          current = previous;
          renderUi();
        },
        toggleHotspots: (enabled?: boolean) => {
          showHotspots = enabled ?? !showHotspots;
          renderUi();
        },
      };
    },
  };
}
