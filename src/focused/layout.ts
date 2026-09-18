import { groupAncestors, orderedGroups } from './groups.js';
import type { DiagramBox, DiagramLayout, DiagramLayoutEdge, DiagramLayoutNode, DiagramModel, DiagramNode, DiagramPoint, DiagramScreenContent } from "./types.js";

export const FONT = 'Inter, "Noto Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const TITLE_SIZE = 15;
export const BODY_SIZE = 12;
export const LABEL_SIZE = 12;
/** Deliberately conservative metrics; no browser, font download, or canvas is needed. */
export function textWidth(text: string, size = TITLE_SIZE): number {
  return Array.from(text).reduce((width, char) => width + size * (/\s/u.test(char) ? .36 : /[\u0000-\u00ff]/u.test(char) ? /[MW@#%&]/.test(char) ? .91 : /[ilI.,:;'!|]/.test(char) ? .34 : .64 : 1.06), 0);
}
export function wrapText(text: string, width: number, size = TITLE_SIZE): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const token of paragraph.match(/[A-Za-z0-9_./:-]+|\s+|[^A-Za-z0-9_./:\-\s]/gu) ?? []) {
      if (textWidth(line + token, size) <= width) { line += token; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
      if (textWidth(token, size) <= width) { line = token.trimStart(); continue; }
      for (const char of Array.from(token)) {
        if (line && textWidth(line + char, size) > width) { lines.push(line); line = ''; }
        line += char;
      }
    }
    if (line || !lines.length) lines.push(line.trimEnd());
  }
  return lines;
}
export function nodeText(node: DiagramNode, kind: DiagramModel['kind'], width: number) {
  const centered = node.shape === 'decision' || node.shape === 'start' || node.shape === 'end';
  const inset = node.shape === 'decision' ? width * .30 : kind === 'sequence' ? 12 : 22;
  const content = width - inset * 2 - (!centered && node.icon ? kind === 'sequence' ? 28 : 44 : 0);
  return { title: wrapText(node.label, content), description: node.description ? wrapText(node.description, content, BODY_SIZE) : [], inset, centered, header: kind === 'screens' ? 27 : 0 };
}
export function iconNodeText(node: DiagramNode) {
  return { title: wrapText(node.label, 140, TITLE_SIZE), description: node.description ? wrapText(node.description, 140, BODY_SIZE) : [] };
}
export function junctionText(node: DiagramNode) {
  const title = wrapText(node.label, 120, 12);
  const description = node.description ? wrapText(node.description, 120, 11) : [];
  return { title, description, width: Math.max(...title.map(line => textWidth(line, 12)), ...description.map(line => textWidth(line, 11))), height: title.length * 17 + (description.length ? 6 + description.length * 16 : 0) };
}
function iconNodeSize(node: DiagramNode) {
  const text = iconNodeText(node);
  return { width: 160, height: 62 + text.title.length * 21 + (text.description.length ? 6 + text.description.length * 17 : 0) + 6 };
}
function screenContent(node: DiagramNode, model: DiagramModel): DiagramScreenContent {
  const width = node.shape === 'modal' ? 240 : 280;
  const title = wrapText(node.label, width - (node.icon ? 76 : 40));
  const description = node.description ? wrapText(node.description, width - 40, BODY_SIZE) : [];
  const incoming = model.edges.filter(edge => edge.to === node.id && !edge.bidirectional).length;
  const headerHeight = Math.max(27 + 18 + Math.max(24, title.length * 21) + (description.length ? 8 + description.length * 17 : 0) + 16, 51 + Math.max(0, incoming - 1) * 14);
  let top = headerHeight + 26;
  const items: Array<{ edge?: DiagramModel['edges'][number]; label: string; line: number; kind?: string; detail?: string }> = model.edges.filter(edge => !edge.actionLine && (edge.from === node.id || edge.bidirectional && edge.to === node.id)).map(edge => {
    const destination = model.nodes.find(n => n.id === (edge.from === node.id ? edge.to : edge.from));
    return { edge, label: edge.label || (destination ? `${destination.label}へ` : '画面へ移動'), line: edge.line, ...(destination?.shape === 'modal' ? { kind: 'modal', detail: 'モーダルを開く' } : {}) };
  });
  for (const action of model.screenActions ?? []) if (action.node === node.id) {
    const target = model.nodes.find(n => n.id === action.to);
    const kind = action.to ? target?.shape === 'modal' ? 'modal' : 'navigate' : action.state ? 'state' : action.close ? 'close' : 'local';
    const detail = action.state ? `状態 → ${action.state}` : action.close ? 'モーダルを閉じる' : action.to ? kind === 'modal' ? 'モーダルを開く' : '画面へ移動' : `画面内操作${action.effect ? ` · ${action.effect}` : ''}`;
    items.push({ edge: model.edges.find(edge => edge.actionLine === action.line), label: action.label, line: action.line, kind, detail: `${action.when ? `${action.when}のとき · ` : ''}${detail}` });
  }
  const actions = (model.screenActions?.length ? items.sort((a,b)=>a.line-b.line) : items).map(item => {
    const lines = wrapText(item.label, width - 48, 13), detail = item.detail ? wrapText(item.detail, width - 48, 10) : undefined;
    const height = Math.max(42, lines.length * 18 + (detail ? 6 + detail.length * 14 : 0) + 20);
    const action = { ...item, detail, lines, top, height }; top += height;
    return action;
  });
  return { title, description, headerHeight, actions, height: actions.length ? top + 10 : headerHeight + 46 };
}
function sizeNode(node: DiagramNode, kind: DiagramModel['kind']): { width: number; height: number } {
  const width = kind === 'sequence' ? 180 : node.shape === 'decision' ? 280 : 240;
  const text = nodeText(node, kind, width);
  const contentHeight = text.title.length * 21 + (text.description.length ? 9 + text.description.length * 17 : 0);
  const height = Math.max(kind === 'sequence' ? 44 : kind === 'screens' ? 114 : 88, contentHeight + (kind === 'sequence' ? 20 : 36) + text.header);
  return { width, height: node.shape === 'decision' ? Math.max(140, height * 1.55) : height };
}
export function boxesOverlap(a: DiagramBox, b: DiagramBox, padding = 0): boolean {
  return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
}
export function segmentIntersectsBox(a: DiagramPoint, b: DiagramPoint, box: DiagramBox, padding = 0): boolean {
  const left = box.x - padding, right = box.x + box.width + padding, top = box.y - padding, bottom = box.y + box.height + padding;
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  return false;
}
function tidy(points: DiagramPoint[]): DiagramPoint[] {
  const result: DiagramPoint[] = [];
  for (const point of points) {
    if (result.length && result[result.length - 1]!.x === point.x && result[result.length - 1]!.y === point.y) continue;
    while (result.length >= 2) {
      const a = result[result.length - 2]!, b = result[result.length - 1]!;
      if ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)) result.pop(); else break;
    }
    result.push(point);
  }
  return result;
}
function length(points: DiagramPoint[]): number {
  return points.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - points[i]!.x) + Math.abs(point.y - points[i]!.y), 0);
}
function ranks(model: DiagramModel): Map<string, number> {
  // Stable strongly connected components keep cycles bounded and preserve DAG depth.
  const adjacency = new Map(model.nodes.map(n => [n.id, [] as string[]]));
  for (const edge of model.edges) if (edge.from !== edge.to && adjacency.has(edge.from) && adjacency.has(edge.to)) adjacency.get(edge.from)!.push(edge.to);
  let clock = 0; const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], active = new Set<string>(), components: string[][] = [];
  function visit(id: string) {
    index.set(id, clock); low.set(id, clock++); stack.push(id); active.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!index.has(next)) { visit(next); low.set(id, Math.min(low.get(id)!, low.get(next)!)); }
      else if (active.has(next)) low.set(id, Math.min(low.get(id)!, index.get(next)!));
    }
    if (low.get(id) === index.get(id)) {
      const members: string[] = []; let next: string;
      do { next = stack.pop()!; active.delete(next); members.push(next); } while (next !== id);
      components.push(members);
    }
  }
  model.nodes.forEach(n => { if (!index.has(n.id)) visit(n.id); });
  const componentOf = new Map<string, number>(); components.forEach((c, i) => c.forEach(id => componentOf.set(id, i)));
  const depth = new Map<number, number>();
  function getDepth(c: number): number {
    if (depth.has(c)) return depth.get(c)!;
    let value = 0;
    for (const edge of model.edges) if (componentOf.get(edge.to) === c && componentOf.get(edge.from) !== c && componentOf.has(edge.from)) value = Math.max(value, getDepth(componentOf.get(edge.from)!) + 1);
    depth.set(c, value); return value;
  }
  return new Map(model.nodes.map(n => [n.id, getDepth(componentOf.get(n.id)!)]));
}
type Cell = { col: number; row: number };
type Side = 'left' | 'right' | 'top' | 'bottom';
function placeCells(model: DiagramModel): Map<string, Cell> {
  const cells = new Map<string, Cell>(), occupied = new Set<string>();
  const reserve = (node: DiagramNode, col: number, row: number) => {
    while (occupied.has(`${col},${row}`)) row++;
    occupied.add(`${col},${row}`); cells.set(node.id, { col, row });
  };
  const depth = ranks(model);
  if (model.kind === 'layers') {
    const ungroupedRanks = [...new Set(model.nodes.filter(n => !n.group).map(n => depth.get(n.id) ?? 0))].sort((a, b) => a - b);
    const layerKeys = [...orderedGroups(model).filter(g => model.nodes.some(n => n.group === g.id)).map(g => g.id), ...ungroupedRanks.map(rank => `rank:${rank}`)];
    for (const node of model.nodes) {
      const row = layerKeys.indexOf(node.group ?? `rank:${depth.get(node.id) ?? 0}`);
      let col = 0; while (occupied.has(`${col},${row}`)) col++;
      reserve(node, col, row);
    }
    return cells;
  }
  // Manual coordinates reserve their cells first. Automatic nodes never cover them.
  for (const node of model.nodes) if (node.at) reserve(node, node.at[0] - 1, node.at[1] - 1);
  let band = 0;
  const buckets = [...orderedGroups(model).map(g => g.id), ''];
  for (const group of buckets) {
    const members = model.nodes.filter(n => (n.group ?? '') === group && !cells.has(n.id));
    if (!members.length) continue;
    const counts = new Map<number, number>();
    for (const node of members) {
      const rank = depth.get(node.id) ?? 0, offset = counts.get(rank) ?? 0; counts.set(rank, offset + 1);
      const col = model.direction === 'LR' ? rank : offset;
      const row = model.direction === 'LR' ? band + offset : band + rank;
      reserve(node, col, row);
    }
    band = Math.max(band, ...members.map(n => cells.get(n.id)!.row + 1));
  }
  // Compact empty grid tracks while retaining the ordering of authored coordinates.
  const columns = [...new Set([...cells.values()].map(c => c.col))].sort((a, b) => a - b);
  const rows = [...new Set([...cells.values()].map(c => c.row))].sort((a, b) => a - b);
  for (const cell of cells.values()) { cell.col = columns.indexOf(cell.col); cell.row = rows.indexOf(cell.row); }
  return cells;
}
function port(node: DiagramLayoutNode, side: Side, offset: number): DiagramPoint {
  if (node.junction) {
    const bar = node.junction;
    return side === 'top' || side === 'bottom'
      ? { x: bar.x + bar.width / 2 + offset, y: bar.y + (side === 'bottom' ? bar.height : 0) }
      : { x: bar.x + (side === 'right' ? bar.width : 0), y: bar.y + bar.height / 2 + offset };
  }
  const x = node.x + node.width / 2, y = node.y + node.height / 2;
  if (node.iconMode) {
    if (side === 'left' || side === 'right') return { x: x + (side === 'left' ? -24 : 24), y: node.y + 24 + offset };
    return { x: x + offset, y: side === 'top' ? node.y : node.y + node.height };
  }
  if (node.screen && (side === 'left' || side === 'right')) return { x: side === 'left' ? node.x : node.x + node.width, y: node.y + 27 + (node.screen.headerHeight - 27) / 2 + offset };
  if (side === 'left' || side === 'right') {
    const inset = node.node.shape === 'decision' ? Math.abs(offset) * node.width / node.height : 0;
    return { x: side === 'left' ? node.x + inset : node.x + node.width - inset, y: y + offset };
  }
  const inset = node.node.shape === 'decision' ? Math.abs(offset) * node.height / node.width : 0;
  return { x: x + offset, y: side === 'top' ? node.y + inset : node.y + node.height - inset };
}
function sidePair(a: DiagramLayoutNode, b: DiagramLayoutNode, direction: DiagramModel['direction']): [Side, Side] {
  if (a === b) return ['right', 'bottom'];
  const dx = b.x + b.width / 2 - a.x - a.width / 2, dy = b.y + b.height / 2 - a.y - a.height / 2;
  if (a.node.shape === 'decision') {
    if (direction === 'TD' && Math.abs(dx) > 1) return [dx < 0 ? 'left' : 'right', dy >= 0 ? 'top' : 'bottom'];
    if (direction === 'LR' && Math.abs(dy) > 1) return [dy < 0 ? 'top' : 'bottom', dx >= 0 ? 'left' : 'right'];
  }
  if (b.node.shape === 'end') {
    if (direction === 'TD' && Math.abs(dx) > 1) return [dy >= 0 ? 'bottom' : 'top', dx > 0 ? 'left' : 'right'];
    if (direction === 'LR' && Math.abs(dy) > 1) return [dx >= 0 ? 'right' : 'left', dy > 0 ? 'top' : 'bottom'];
  }
  if (direction === 'LR' && dx < -1) return Math.abs(dy) < 1 ? ['top', 'top'] : dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  if (direction === 'TD' && dy < -1) return Math.abs(dx) < 1 ? ['right', 'right'] : dx > 0 ? ['right', 'left'] : ['left', 'right'];
  if (direction === 'LR' && Math.abs(dx) > 1 || Math.abs(dy) < 1) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}
function labelSize(label: string): { width: number; height: number } {
  const lines = wrapText(label, 166, LABEL_SIZE);
  return { width: Math.max(34, ...lines.map(line => textWidth(line, LABEL_SIZE) + 18)), height: lines.length * 16 + 10 };
}
function labelPositions(points: DiagramPoint[], size: { width: number; height: number }): DiagramBox[] {
  const boxes: DiagramBox[] = [];
  const segments = points.slice(1).map((b, i) => ({ a: points[i]!, b, len: Math.abs(b.x - points[i]!.x) + Math.abs(b.y - points[i]!.y) })).sort((a, b) => b.len - a.len);
  for (const { a, b, len } of segments) {
    const horizontal = a.y === b.y, needed = horizontal ? size.width + 28 : size.height + 22;
    if (len < needed) continue;
    for (const fraction of [.5, .3, .7]) boxes.push({ x: a.x + (b.x - a.x) * fraction - size.width / 2, y: a.y + (b.y - a.y) * fraction - size.height / 2, ...size });
  }
  return boxes;
}
function sequenceLayout(model: DiagramModel): DiagramLayout {
  const margin = 56;
  const sizes = model.nodes.map(node => sizeNode(node, 'sequence'));
  const nodeHeight = Math.max(44, ...sizes.map(s => s.height));
  const messageWidth = Math.max(170, ...model.edges.map(e => e.label ? labelSize(e.label).width : 0));
  const pitch = Math.max(328, messageWidth + 110);
  const titleSpace = model.title ? wrapText(model.title, Math.max(280, model.nodes.length * pitch - 72), 19).length * 26 + 28 : 16;
  const nodes = model.nodes.map((node, i) => ({ node, x: margin + i * pitch, y: margin + titleSpace, width: sizes[i]!.width, height: nodeHeight }));
  const byId = new Map(nodes.map(n => [n.node.id, n]));
  let y = margin + titleSpace + nodeHeight + 56;
  const edges: DiagramLayoutEdge[] = [];
  const activations: NonNullable<DiagramLayout['activations']> = [];
  const open = new Map<string, typeof activations>();
  const fragments: NonNullable<DiagramLayout['fragments']> = [];
  const fragmentStack: typeof fragments = [];
  const controls = [...model.activationEvents ?? [], ...model.fragmentEvents ?? []].sort((a, b) => a.line - b.line);
  const frameRight = Math.max(margin + 200, ...nodes.map(n => n.x + n.width)) + 24;
  function applyActivations(afterEdge: number, at: number): number {
    let cursor = at;
    for (const event of controls) {
      if (event.afterEdge !== afterEdge) continue;
      if (!('node' in event)) {
        if (event.action === 'alt' || event.action === 'opt' || event.action === 'loop' || event.action === 'par') {
          const depth = fragmentStack.length, x = 24 + depth * 16, width = frameRight - depth * 16 - x;
          const headerHeight = Math.max(34, wrapText(event.label, width - 84, 12).length * 17 + 16);
          const frame = { kind: event.action, label: event.label, line: event.line, depth, x, y: cursor + 24, width, height: 0, headerHeight, branches: [] as Array<{ label: string; y: number; height: number }> };
          fragments.push(frame); fragmentStack.push(frame); cursor = frame.y + headerHeight + 12;
        } else {
          const frame = fragmentStack[fragmentStack.length - 1];
          if (frame && (event.action === 'else' || event.action === 'and')) {
            const height = Math.max(32, wrapText(event.label, frame.width - 32, 12).length * 17 + 16);
            const branch = { label: event.label, y: cursor + 24, height };
            frame.branches.push(branch); cursor = branch.y + height + 12;
          } else if (frame) { frame.height = Math.max(frame.headerHeight + 48, cursor + 24 - frame.y); cursor = frame.y + frame.height + 12; fragmentStack.pop(); }
        }
        continue;
      }
      const node = byId.get(event.node); if (!node) continue;
      const stack = open.get(event.node) ?? [];
      if (event.action === 'activate') {
        const bar = { node: event.node, depth: stack.length, line: event.line, x: node.x + node.width / 2 - 6 + stack.length * 8, y: cursor, width: 12, height: 16 };
        activations.push(bar); stack.push(bar);
      } else {
        const bar = stack.pop();
        if (bar) { bar.height = Math.max(16, cursor + 12 - bar.y); cursor = bar.y + bar.height + 8; }
      }
      open.set(event.node, stack);
    }
    return cursor;
  }
  y = Math.max(y, applyActivations(0, y - 24) + 24);
  for (const [index, edge] of model.edges.entries()) {
    const a = byId.get(edge.from), b = byId.get(edge.to); if (!a || !b) continue;
    const size = edge.label ? labelSize(edge.label) : undefined;
    y += size ? Math.max(0, size.height - 26) : 0;
    const ax = a.x + a.width / 2, bx = b.x + b.width / 2;
    const points = a === b ? [{ x: ax, y }, { x: ax + Math.max(86, (size?.width ?? 0) + 24), y }, { x: ax + Math.max(86, (size?.width ?? 0) + 24), y: y + 32 }, { x: ax, y: y + 32 }] : [{ x: ax, y }, { x: bx, y }];
    edges.push({ edge, points, ...(size ? { labelBox: { x: bx >= ax ? ax + 12 : ax - 12 - size.width, y: y - size.height - 8, ...size } } : {}) });
    const cursor = applyActivations(index + 1, a === b ? y + 32 : y);
    y = Math.max(y + (a === b ? 110 : 78), cursor + 56);
  }
  // Keep manually constructed models renderable; parsed sources require closed intervals.
  for (const stack of open.values()) for (const bar of stack) bar.height = Math.max(16, y - 28 - bar.y);
  const activeAt = (node: string, at: number) => activations.filter(bar => bar.node === node && at >= bar.y && at <= bar.y + bar.height).sort((a, b) => b.depth - a.depth)[0];
  for (const item of edges) {
    const first = item.points[0]!, last = item.points[item.points.length - 1]!;
    const self = item.edge.from === item.edge.to, right = self || last.x >= first.x;
    const source = activeAt(item.edge.from, first.y), target = activeAt(item.edge.to, last.y);
    if (source) first.x = source.x + (right ? source.width : 0);
    if (target) last.x = target.x + (self || !right ? target.width : 0);
    if (item.labelBox) item.labelBox.x = right ? first.x + 12 : first.x - 12 - item.labelBox.width;
  }
  const rightmost = Math.max(margin + 200, ...nodes.map(n => n.x + n.width), ...edges.flatMap(e => e.points.map(p => p.x)), ...edges.map(e => e.labelBox ? e.labelBox.x + e.labelBox.width : 0));
  for (const frame of fragments) frame.width = Math.max(frame.width, rightmost + 24 - frame.depth * 16 - frame.x);
  return { width: Math.ceil(Math.max(rightmost + margin, ...fragments.map(frame => frame.x + frame.width + 24))), height: Math.ceil(Math.max(y + 28, margin + titleSpace + nodeHeight + 160)), nodes, groups: [], edges, ...(activations.length ? { activations } : {}), ...(fragments.length ? { fragments } : {}) };
}

export function computeDiagramLayout(model: DiagramModel): DiagramLayout {
  if (model.kind === 'sequence') return sequenceLayout(model);
  const iconStyle = model.style === 'icons' && (model.kind === 'system' || model.kind === 'layers');
  const usesIcon = (node: DiagramNode) => iconStyle && (node.shape === 'card' || node.shape === 'database');
  const cells = placeCells(model), sizes = model.nodes.map(node => {
    if (node.shape === 'fork' || node.shape === 'join') {
      const text = junctionText(node);
      return model.direction === 'TD' ? { width: Math.max(240, 120 + 2 * (24 + text.width)), height: Math.max(12, text.height) } : { width: 240, height: 120 + 2 * (24 + text.height) };
    }
    if (model.kind === 'screens' && (node.shape === 'card' || node.shape === 'modal')) {
      const screen = screenContent(node, model);
      return { width: node.shape === 'modal' ? 240 : 280, height: screen.height, screen };
    }
    return usesIcon(node) ? iconNodeSize(node) : sizeNode(node, model.kind);
  });
  const maxW = Math.max(iconStyle ? 160 : 240, ...sizes.map(s => s.width)), maxH = Math.max(88, ...sizes.map(s => s.height));
  const maxLabel = Math.max(0, ...model.edges.map(e => e.label ? labelSize(e.label).width : 0));
  const degree = new Map<string, number>(); model.edges.forEach(e => { degree.set(e.from, (degree.get(e.from) ?? 0) + 1); degree.set(e.to, (degree.get(e.to) ?? 0) + 1); });
  const maxDegree = Math.max(0, ...degree.values());
  const nesting = Math.max(1, ...model.groups.map(group => groupAncestors(model, group.id).length));
  const screenGap = model.kind === 'screens' ? maxDegree * 16 + 64 : 0;
  const gapX = Math.max(screenGap, nesting > 1 ? nesting * 44 + 48 : 0, iconStyle ? Math.max(96, maxLabel + 32, Math.min(maxDegree, 16) * 8 + 48) : Math.max(170, maxLabel + 48, Math.min(maxDegree, 16) * 12 + 72));
  const groupHeader = Math.max(46, ...model.groups.map(g => wrapText(g.label, Math.min(250, ...sizes.map(size => size.width + 10)), 12).length * 17 + 24));
  const gapY = Math.max(screenGap, nesting > 1 ? nesting * (groupHeader + 22) + 40 : 0, iconStyle ? Math.max(88, groupHeader + 40, Math.min(maxDegree, 16) * 8 + 48) : Math.max(132, groupHeader + 64, Math.min(maxDegree, 16) * 10 + 68));
  const marginX = Math.max(screenGap ? gapX / 2 + 32 : 0, 100, maxLabel / 2 + 36, nesting * 22 + 24);
  const columns = Math.max(1, ...[...cells.values()].map(c => c.col + 1)), rows = Math.max(1, ...[...cells.values()].map(c => c.row + 1));
  const pitchX = maxW + gapX, pitchY = maxH + gapY;
  const titleHeight = model.title ? wrapText(model.title, marginX * 2 + columns * maxW + (columns - 1) * gapX - 72, 19).length * 26 + 22 : 0;
  const marginY = titleHeight + Math.max(groupHeader * nesting + 48, screenGap ? gapY / 2 + 32 : 0);
  const xGutters = Array.from({ length: columns + 1 }, (_, i) => marginX - gapX / 2 + i * pitchX);
  const yGutters = Array.from({ length: rows + 1 }, (_, i) => marginY - gapY / 2 + i * pitchY);
  const nodes: DiagramLayoutNode[] = model.nodes.map((node, i) => ({ node, x: marginX + cells.get(node.id)!.col * pitchX + (maxW - sizes[i]!.width) / 2, y: marginY + cells.get(node.id)!.row * pitchY + (usesIcon(node) || model.kind === 'screens' && (node.shape === 'card' || node.shape === 'modal') ? 0 : (maxH - sizes[i]!.height) / 2), ...sizes[i]!, ...(usesIcon(node) ? { iconMode: true } : {}) }));
  const nodeById = new Map(nodes.map(n => [n.node.id, n]));
  for (const node of nodes) if (node.node.shape === 'fork' || node.node.shape === 'join') {
    const cx = node.x + node.width / 2, cy = node.y + node.height / 2, text = junctionText(node.node);
    node.junction = model.direction === 'TD' ? { x: cx - 60, y: cy - 5, width: 120, height: 10 } : { x: cx - 5, y: cy - 60, width: 10, height: 120 };
    node.junctionLabel = model.direction === 'TD' ? { x: cx + 84, y: cy - text.height / 2, width: text.width, height: text.height } : { x: cx - text.width / 2, y: cy + 84, width: text.width, height: text.height };
  }
  const junctionLabels = nodes.flatMap(node => node.junctionLabel ? [node.junctionLabel] : []);
  const groups: DiagramLayout['groups'] = [];
  const groupLabels: DiagramBox[] = [];
  const groupOrder = orderedGroups(model);
  const groupBoxes = new Map<string, DiagramLayout['groups'][number]>();
  // Build from children upward, then paint parents before their children.
  for (const group of [...groupOrder].reverse()) {
    const members: DiagramBox[] = [...nodes.filter(n => n.node.group === group.id), ...groupOrder.filter(child => child.parent === group.id).flatMap(child => groupBoxes.has(child.id) ? [groupBoxes.get(child.id)!] : [])];
    if (!members.length) continue;
    const x = Math.min(...members.map(n => n.x)) - 22;
    const width = Math.max(...members.map(n => n.x + n.width)) - x + 22;
    const header = Math.max(46, wrapText(group.label, width - 34, 12).length * 17 + 24);
    const y = Math.min(...members.map(n => n.y)) - header;
    const height = Math.max(...members.map(n => n.y + n.height)) - y + 22;
    groupBoxes.set(group.id, { group, x, y, width, height });
    groupLabels.push({ x: x + 16, y: y + 9, width: Math.min(width - 32, textWidth(group.label, 12)), height: wrapText(group.label, width - 34, 12).length * 17 + 5 });
  }
  for (const group of groupOrder) if (groupBoxes.has(group.id)) groups.push(groupBoxes.get(group.id)!);
  // Assign ports from geometry, not edge declaration order. Aligned connections
  // keep the center; branches occupy the side nearest their destination.
  const pairCounts = new Map<string, number>();
  const compareKey = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const connectionKey = (edge: DiagramModel['edges'][number]) => `${edge.from}:${edge.to}:${edge.style === 'solid' ? 0 : 1}:${edge.label}`;
  const specs = [...model.edges].sort((a, b) => compareKey(connectionKey(a), connectionKey(b))).flatMap(edge => {
    const a = nodeById.get(edge.from), b = nodeById.get(edge.to); if (!a || !b) return [];
    let [sa, sb] = sidePair(a, b, model.kind === 'layers' ? 'TD' : model.direction);
    const pair = `${edge.from}:${edge.to}`, repetition = pairCounts.get(pair) ?? 0; pairCounts.set(pair, repetition + 1);
    if (repetition && a !== b) { if (a.y === b.y) sa = sb = repetition % 2 ? 'bottom' : 'top'; else if (a.x === b.x) sa = sb = repetition % 2 ? 'right' : 'left'; }
    // Synchronization bars connect through their broad faces, leaving their captions clear.
    if (a.junction) sa = model.direction === 'TD' ? (b.y >= a.y ? 'bottom' : 'top') : (b.x >= a.x ? 'right' : 'left');
    if (b.junction) sb = model.direction === 'TD' ? (a.y <= b.y ? 'top' : 'bottom') : (a.x <= b.x ? 'left' : 'right');
    // An action owns its source port. Incoming transitions attach to the screen header.
    const screenDeltaX = b.x + b.width / 2 - a.x - a.width / 2;
    if (a.screen) sa = screenDeltaX < -1 ? 'left' : 'right';
    if (b.screen) sb = a === b ? 'top' : edge.bidirectional ? screenDeltaX > 1 ? 'left' : 'right' : Math.abs(screenDeltaX) < 1 ? 'top' : screenDeltaX > 0 ? 'left' : 'right';
    // A return to the preceding screen goes around the row, away from forward arrivals.
    if (a.screen && b.screen && a.y === b.y && b.x < a.x && !edge.bidirectional && model.edges.some(other => other.from === edge.to && other.to === edge.from)) {
      sa = 'right'; sb = 'top';
    }
    return [{ edge, a, b, sa, sb, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }];
  });
  type PortRequest = { spec: typeof specs[number]; endpoint: 'start' | 'end'; node: DiagramLayoutNode; side: Side; delta: number };
  const portGroups = new Map<string, PortRequest[]>();
  const edgeKey = (spec: typeof specs[number]) => connectionKey(spec.edge);
  for (const spec of specs) for (const endpoint of ['start', 'end'] as const) {
    const node = endpoint === 'start' ? spec.a : spec.b, other = endpoint === 'start' ? spec.b : spec.a;
    const side = endpoint === 'start' ? spec.sa : spec.sb, horizontal = side === 'top' || side === 'bottom';
    const action = endpoint === 'start' || spec.edge.bidirectional && spec.a !== spec.b ? node.screen?.actions.find(item => item.edge === spec.edge) : undefined;
    if (action) {
      spec[endpoint] = { x: side === 'left' ? node.x : node.x + node.width, y: node.y + action.top + action.height / 2 };
      continue;
    }
    const delta = horizontal ? other.x + other.width / 2 - node.x - node.width / 2 : other.y + other.height / 2 - node.y - node.height / 2;
    const key = `${node.node.id}:${side}`;
    const requests = portGroups.get(key) ?? [];
    requests.push({ spec, endpoint, node, side, delta }); portGroups.set(key, requests);
  }
  const screenArrivalTracks = new Map<string, number[]>();
  for (const requests of portGroups.values()) {
    requests.sort((a, b) => a.delta - b.delta || compareKey(edgeKey(a.spec), edgeKey(b.spec)));
    const { node, side } = requests[0]!;
    const limit = node.junction ? Math.max(0, (side === 'left' || side === 'right' ? node.junction.height : node.junction.width) / 2 - 8) : node.screen && (side === 'left' || side === 'right') ? Math.max(0, (node.screen.headerHeight - 27) / 2 - 12) : node.iconMode ? 16 : (side === 'left' || side === 'right' ? node.height : node.width) / 2 - 24;
    const pivot = requests.reduce((best, item, i) => Math.abs(item.delta) < Math.abs(requests[best]!.delta) ? i : best, 0);
    // Leave room for a neighboring straight edge's label as well as its stroke.
    // A 16–24px fan can otherwise pass through a label centered on that edge.
    const preferredSpacing = Math.max(24, ...requests.map(({ spec }) => {
      if (!spec.edge.label) return 24;
      const label = labelSize(spec.edge.label);
      return Math.ceil(((side === 'left' || side === 'right' ? label.height : label.width) / 2 + 12) / 8) * 8;
    }));
    const spacing = node.junction ? 2 * limit / Math.max(1, requests.length - 1) : Math.min(preferredSpacing, limit / Math.max(1, pivot, requests.length - pivot - 1));
    // Anchor an aligned edge precisely. Otherwise distribute the fan symmetrically.
    const anchor = !node.junction && Math.abs(requests[pivot]!.delta) < 1 ? pivot : (requests.length - 1) / 2;
    requests.forEach((request, i) => {
      const point = port(node, side, (i - anchor) * spacing);
      if (node.screen && (side === 'left' || side === 'right')) {
        // Opposite faces share a corridor: reserve arrival heights across both cards.
        const cell = cells.get(node.node.id)!;
        const key = `${cell.row}:${cell.col + (side === 'right' ? 1 : 0)}`;
        const used = screenArrivalTracks.get(key) ?? [];
        const low = node.y + 39, high = node.y + node.screen.headerHeight - 12;
        const candidates = [point.y, ...Array.from({ length: Math.max(1, Math.floor(high - low) + 1) }, (_, j) => low + j)];
        candidates.sort((a, b) => Math.abs(a - point.y) - Math.abs(b - point.y) || a - b);
        const available = candidates.find(y => y >= low && y <= high && used.every(other => Math.abs(y - other) >= 14));
        if (available !== undefined) point.y = available;
        used.push(point.y); screenArrivalTracks.set(key, used);
      }
      request.spec[request.endpoint] = point;
    });
  }
  const aligned = (spec: typeof specs[number]) => spec.start.x === spec.end.x && spec.sa !== spec.sb || spec.start.y === spec.end.y && spec.sa !== spec.sb;
  const originalOrder = new Map(model.edges.map((edge, i) => [edge, i]));
  // Establish simple aligned routes first, then route branches around them.
  specs.sort((a, b) => Number(aligned(b)) - Number(aligned(a)) || length([a.start, a.end]) - length([b.start, b.end]) || compareKey(edgeKey(a), edgeKey(b)));
  const edges: DiagramLayoutEdge[] = [], usedLabels: DiagramBox[] = [];
  const extent = { width: marginX * 2 + columns * maxW + (columns - 1) * gapX, height: marginY + rows * maxH + (rows - 1) * gapY + 90 };
  for (const [edgeIndex, { edge, a, b, sa, sb, start, end }] of specs.entries()) {
    const ca = cells.get(a.node.id)!, cb = cells.get(b.node.id)!;
    const laneSpacing = model.kind === 'screens' ? 16 : 8;
    const lane = edgeIndex === 0 ? 0 : (Math.ceil(edgeIndex / 2) % 4) * (edgeIndex % 2 ? laneSpacing : -laneSpacing);
    const escape = (point: DiagramPoint, side: Side, cell: Cell): DiagramPoint => side === 'left' || side === 'right'
      ? { x: xGutters[cell.col + (side === 'right' ? 1 : 0)]! + lane, y: point.y }
      : { x: point.x, y: yGutters[cell.row + (side === 'bottom' ? 1 : 0)]! + lane };
    const ea = escape(start, sa, ca), eb = escape(end, sb, cb), ah = sa === 'left' || sa === 'right', bh = sb === 'left' || sb === 'right';
    const candidates: DiagramPoint[][] = [
      [start, { x: end.x, y: start.y }, end],
      [start, { x: start.x, y: end.y }, end],
    ];
    // Two-bend paths can use the middle of the shared corridor directly;
    // routing via two separate escape tracks creates unnecessary tiny doglegs.
    if (ah && bh) {
      for (const x of [(start.x + end.x) / 2, ea.x, eb.x]) candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
    } else if (!ah && !bh) {
      for (const y of [(start.y + end.y) / 2, ea.y, eb.y]) candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
    }
    const outward = (origin: DiagramPoint, next: DiagramPoint, side: Side) => side === 'left' ? next.y === origin.y && next.x < origin.x : side === 'right' ? next.y === origin.y && next.x > origin.x : side === 'top' ? next.x === origin.x && next.y < origin.y : next.x === origin.x && next.y > origin.y;
    if (a !== b && (start.x === end.x && (sa === 'bottom' && sb === 'top' || sa === 'top' && sb === 'bottom') || start.y === end.y && (sa === 'right' && sb === 'left' || sa === 'left' && sb === 'right'))) candidates.push([start, end]);
    if (ah && bh) for (const y of yGutters) candidates.push([start, ea, { x: ea.x, y: y + lane }, { x: eb.x, y: y + lane }, eb, end]);
    else if (!ah && !bh) for (const x of xGutters) candidates.push([start, ea, { x: x + lane, y: ea.y }, { x: x + lane, y: eb.y }, eb, end]);
    else {
      candidates.push([start, ea, ah ? { x: ea.x, y: eb.y } : { x: eb.x, y: ea.y }, eb, end]);
      for (const x of xGutters) for (const y of yGutters) candidates.push(ah
        ? [start, ea, { x: ea.x, y: y + lane }, { x: x + lane, y: y + lane }, { x: x + lane, y: eb.y }, eb, end]
        : [start, ea, { x: x + lane, y: ea.y }, { x: x + lane, y: y + lane }, { x: eb.x, y: y + lane }, eb, end]);
    }
    if (a.screen && b.screen) {
      // Offer every available track in the gutters instead of cycling four lanes.
      const reach = Math.floor((Math.min(gapX, gapY) / 2 - 16) / 16);
      for (let track = -reach; track <= reach; track++) {
        const offset = track * 16;
        const exit = (point: DiagramPoint, side: Side, cell: Cell): DiagramPoint => side === 'left' || side === 'right'
          ? { x: Math.max(16, xGutters[cell.col + (side === 'right' ? 1 : 0)]! + offset), y: point.y }
          : { x: point.x, y: Math.max(titleHeight + 16, yGutters[cell.row + (side === 'bottom' ? 1 : 0)]! + offset) };
        const first = exit(start, sa, ca), last = exit(end, sb, cb);
        if (ah && bh) {
          for (const x of [first.x, last.x]) candidates.push([start, {x,y:start.y}, {x,y:end.y}, end]);
          for (const y of yGutters) {
            const trackY = Math.max(titleHeight + 16, y + offset);
            candidates.push([start, first, {x:first.x,y:trackY}, {x:last.x,y:trackY}, last, end]);
          }
        } else candidates.push([start, first, ah ? {x:first.x,y:last.y} : {x:last.x,y:first.y}, last, end]);
      }
    }
    let best: { points: DiagramPoint[]; labelBox?: DiagramBox; score: number } | undefined;
    const size = edge.label && !a.screen && !(edge.bidirectional && b.screen) ? labelSize(edge.label) : undefined;
    for (const raw of candidates) {
      const points = tidy(raw);
      // Collision and label penalties are nonnegative. A candidate whose base
      // cost already loses cannot improve the result; skip its expensive scans.
      let score = length(points) + (points.length - 2) * 60;
      if (best && score >= best.score) continue;
      if (points.length < 2 || !outward(start, points[1]!, sa) || !outward(end, points[points.length - 2]!, sb)) continue;
      if (points.slice(1).some((p, i) => junctionLabels.some(box => segmentIntersectsBox(points[i]!, p, box, 8)))) continue;
      if (points.slice(1).some((p, i) => nodes.some(n => !(n === a && i === 0) && !(n === b && i === points.length - 2) && segmentIntersectsBox(points[i]!, p, n, -1)))) continue;
      for (let i = 1; i < points.length; i++) {
        for (const box of [...usedLabels, ...groupLabels]) if (segmentIntersectsBox(points[i - 1]!, points[i]!, box, 9)) score += 3000;
        for (const previous of edges) for (let j = 1; j < previous.points.length; j++) {
          const p = points[i - 1]!, q = points[i]!, r = previous.points[j - 1]!, s = previous.points[j]!;
          if (p.x === q.x && r.x === s.x && p.x === r.x && Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) > Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)) || p.y === q.y && r.y === s.y && p.y === r.y && Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) > Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x))) score += a.screen && b.screen ? 1e7 : 2200;
          if (p.x === q.x && r.y === s.y && p.x > Math.min(r.x, s.x) && p.x < Math.max(r.x, s.x) && r.y > Math.min(p.y, q.y) && r.y < Math.max(p.y, q.y) || p.y === q.y && r.x === s.x && r.x > Math.min(p.x, q.x) && r.x < Math.max(p.x, q.x) && p.y > Math.min(r.y, s.y) && p.y < Math.max(r.y, s.y)) score += 240;
        }
      }
      let labelBox: DiagramBox | undefined;
      if (size) {
        let labelScore = Infinity;
        for (const box of labelPositions(points, size)) {
          if (box.x < 8 || box.y < (titleHeight + 8) || nodes.some(n => boxesOverlap(box, n, 12)) || [...usedLabels, ...groupLabels].some(other => boxesOverlap(box, other, 8))) continue;
          let penalty = 0;
          for (const previous of edges) for (let j = 1; j < previous.points.length; j++) if (segmentIntersectsBox(previous.points[j - 1]!, previous.points[j]!, box, 4)) penalty += 1800;
          if (penalty < labelScore) { labelScore = penalty; labelBox = box; }
        }
        if (!labelBox) score += 1e7; else score += labelScore;
      }
      if (!best || score < best.score) best = { points, labelBox, score };
    }
    const chosen = best ?? { points: tidy([start, ea, { x: ea.x, y: eb.y }, eb, end]), score: 0 };
    // A crowded label gets a connected outer route, preserving its association.
    if (size && !chosen.labelBox) {
      const y = Math.max(extent.height + size.height, ...usedLabels.map(box => box.y + box.height + size.height + 18));
      const left = extent.width + 28, right = left + size.width + 44;
      const sourceGutter = ah ? yGutters[ca.row + 1]! + lane : ea.y;
      const targetGutter = bh ? yGutters[cb.row + 1]! + lane : eb.y;
      chosen.points = tidy([start, ea, { x: ea.x, y: sourceGutter }, { x: left, y: sourceGutter }, { x: left, y }, { x: right, y }, { x: right, y: targetGutter }, { x: eb.x, y: targetGutter }, eb, end]);
      chosen.labelBox = { x: left + 22, y: y - size.height / 2, ...size };
    }
    if (chosen.labelBox) usedLabels.push(chosen.labelBox);
    edges.push({ edge, points: chosen.points, ...(chosen.labelBox ? { labelBox: chosen.labelBox } : {}) });
  }
  const width = Math.ceil(Math.max(extent.width, ...groups.map(group => group.x + group.width + 24), ...edges.flatMap(e => e.points.map(p => p.x + 48)), ...usedLabels.map(b => b.x + b.width + 30)));
  const height = Math.ceil(Math.max(extent.height, ...groups.map(group => group.y + group.height + 24), ...edges.flatMap(e => e.points.map(p => p.y + 48)), ...usedLabels.map(b => b.y + b.height + 30)));
  edges.sort((a, b) => originalOrder.get(a.edge)! - originalOrder.get(b.edge)!);
  return { width, height, nodes, groups, edges };
}
