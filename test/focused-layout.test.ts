import { describe, expect, it } from 'vitest';
import { boxesOverlap, computeDiagramLayout, nodeText, segmentIntersectsBox, textWidth, wrapText } from '../src/focused/layout.js';
import { renderDiagram } from '../src/focused/render.js';
import { parseDiagram } from '../src/focused/parser.js';
import { DIAGRAM_SAMPLES } from '../src/focused/samples.js';
import type { DiagramLayout, DiagramModel } from '../src/focused/types.js';

function assertGeometry(layout: DiagramLayout, kind = 'system') {
  for (const [index, node] of layout.nodes.entries()) {
    expect(node.x).toBeGreaterThanOrEqual(0); expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.x + node.width).toBeLessThanOrEqual(layout.width); expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
    for (const other of layout.nodes.slice(index + 1)) expect(boxesOverlap(node, other), `${node.node.id} / ${other.node.id}`).toBe(false);
  }
  for (const [index, edge] of layout.edges.entries()) {
    for (const [pointIndex, b] of edge.points.slice(1).entries()) {
      const a = edge.points[pointIndex]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      if (kind !== 'sequence') for (const node of layout.nodes) {
        if (node.node.id === edge.edge.from && pointIndex === 0 || node.node.id === edge.edge.to && pointIndex === edge.points.length - 2) continue;
        expect(segmentIntersectsBox(a, b, node, -1), `${edge.edge.from}->${edge.edge.to} crosses ${node.node.id}`).toBe(false);
      }
    }
    if (edge.labelBox) {
      for (const node of layout.nodes) expect(boxesOverlap(edge.labelBox, node), `label ${edge.edge.label} overlaps ${node.node.id}`).toBe(false);
      for (const other of layout.edges.slice(index + 1)) if (other.labelBox) expect(boxesOverlap(edge.labelBox, other.labelBox), `labels ${edge.edge.label} and ${other.edge.label}`).toBe(false);
    }
  }
}

describe('focused grid layout', () => {
  for (const sample of DIAGRAM_SAMPLES) it(`keeps ${sample.id} sample cards and labels separate`, () => {
    const model = parseDiagram(sample.source), layout = computeDiagramLayout(model);
    assertGeometry(layout, model.kind);
    expect(computeDiagramLayout(model)).toEqual(layout);
    expect(renderDiagram(model).svg).toBe(renderDiagram(model).svg);
  });
  it('routes past intervening cards and handles branches, cycles, self and parallel edges', () => {
    const model = parseDiagram(`diagram system LR
node a "開始" at=1,1
node b "中間" at=2,1
node c "終了" at=3,1
node d "分岐" at=2,2
a -> c "飛び越す"
a -> b "最初"
a -> b "別の要求"
b -> d "枝"
d -> a "戻り"
c -> c "再試行"`);
    assertGeometry(computeDiagramLayout(model));
  });
  it('contains automatic group members within separate containers', () => {
    const model = parseDiagram(`diagram system LR
group one "Frontend" color=blue
group two "Backend" color=green
node a "Web" group=one
node b "Mobile" group=one
node c "API" group=two
node d "Data" group=two
a -> c
b -> c
c -> d`), layout = computeDiagramLayout(model);
    assertGeometry(layout);
    for (const group of layout.groups) for (const node of layout.nodes.filter(n => n.node.group === group.group.id)) {
      expect(node.x).toBeGreaterThan(group.x); expect(node.y).toBeGreaterThan(group.y);
      expect(node.x + node.width).toBeLessThan(group.x + group.width); expect(node.y + node.height).toBeLessThan(group.y + group.height);
    }
    expect(boxesOverlap(layout.groups[0]!, layout.groups[1]!)).toBe(false);
  });
  it('wraps long Japanese and explicit newlines without losing content', () => {
    const label = '非常に長い日本語のサービス名称と注文処理についての説明';
    const model = parseDiagram(`diagram system\ntitle "${label.repeat(3)}"\nnode a "${label}\\n第二行" description="${label.repeat(3)}"\nnode b "先"\na -> b "${label}"`);
    const layout = computeDiagramLayout(model); assertGeometry(layout);
    for (const node of layout.nodes) {
      const text = nodeText(node.node, model.kind, node.width);
      expect(text.title.join('')).toBe(node.node.label.replace(/\n/g, ''));
      expect(text.title.every(line => textWidth(line) <= node.width - 44)).toBe(true);
      expect(node.height).toBeGreaterThan(text.title.length * 21 + text.description.length * 17);
    }
    expect(wrapText('ABCDEFGHIJKLMNO', 40).every(line => textWidth(line) <= 40)).toBe(true);
  });
  it('renders ordered sequence messages and a visible self loop', () => {
    const model = parseDiagram(`diagram sequence
node a "Client"
node b "API"
a -> b "request"
b -> b "内部検証"
b --> a "response"`), layout = computeDiagramLayout(model);
    assertGeometry(layout, 'sequence');
    expect(layout.nodes[0]!.x).toBeLessThan(layout.nodes[1]!.x);
    expect(layout.edges[0]!.points[0]!.y).toBeLessThan(layout.edges[1]!.points[0]!.y);
    expect(layout.edges[1]!.points[layout.edges[1]!.points.length - 1]!.y).toBeLessThan(layout.edges[2]!.points[0]!.y);
    expect(layout.edges[1]!.points).toHaveLength(4);
    expect(renderDiagram(model).svg).toContain('archmap-lifeline');
  });
  it('escapes authored SVG text and keeps exports self contained', () => {
    const model = parseDiagram('diagram system\ntitle "<script>&"\nnode a "<svg onload=bad>"');
    const result = renderDiagram(model);
    expect(result.svg).toContain('&lt;script&gt;&amp;'); expect(result.svg).not.toContain('<script>');
    expect(result.svg).toContain('role="img"'); expect(result.svg).not.toContain('href="http');
  });
  it('reports overlapping authored group regions without mutating the parsed model', () => {
    const model = parseDiagram(`diagram system
group a "A"
group b "B"
node one "One" group=a at=1,1
node two "Two" group=a at=3,1
node three "Three" group=b at=2,1`);
    const before = model.diagnostics.slice();
    const result = renderDiagram(model);
    expect(result.model.diagnostics.some(d => d.severity === 'warning' && d.message.includes('領域'))).toBe(true);
    expect(model.diagnostics).toEqual(before);
  });
  it('keeps a reverse screen transition visibly associated with its label', () => {
    const model = parseDiagram(`diagram screens
node a "A" at=1,1
node b "B" at=2,1
a -> b "進む"
b -> a "戻る"`), layout = computeDiagramLayout(model);
    assertGeometry(layout, 'screens');
    const reverse = layout.edges[1]!;
    expect(reverse.points.length).toBeGreaterThan(2);
    expect(reverse.labelBox!.y).toBeLessThan(layout.nodes[0]!.y);
    expect(reverse.points.slice(1).some((b, i) => segmentIntersectsBox(reverse.points[i]!, b, reverse.labelBox!))).toBe(true);
  });
  it('routes a dense 100 edge graph without card or label overlap', () => {
 const nodes = Array.from({length:40},(_,i)=>({id:`n${i}`,label:`サービス${i}`,shape:'card' as const,color:'blue' as const,line:i+1,at:[i%8+1,Math.floor(i/8)+1] as [number,number]}));
 const model:DiagramModel={kind:'system',direction:'LR',title:'',nodes,groups:[],diagnostics:[],edges:Array.from({length:100},(_,i)=>({from:`n${(i*7)%40}`,to:`n${(i*11+3)%40}`,label:`メッセージ番号 ${i}`,style:'solid' as const,bidirectional:false,line:50+i}))};
 const started = performance.now(); const layout = computeDiagramLayout(model);
 expect(performance.now() - started).toBeLessThan(1500);
 assertGeometry(layout);
  });
  it('orders ungrouped layer bands by dependency depth regardless of declaration order', () => {
    const model = parseDiagram('diagram layers\nnode db "DB"\nnode api "API"\nnode web "Web"\nweb -> api\napi -> db');
    const layout = computeDiagramLayout(model);
    const positions = new Map(layout.nodes.map(n => [n.node.id, n.y]));
    expect(positions.get('web')!).toBeLessThan(positions.get('api')!);
    expect(positions.get('api')!).toBeLessThan(positions.get('db')!);
    assertGeometry(layout, 'layers');
  });
  it('reserves the complete group header when other nodes have wider shapes', () => {
    const model = parseDiagram(`diagram system\ngroup g "${'あ'.repeat(120)}"\nnode card "Card" group=g\nnode decision "Decision" shape=decision`);
    const layout = computeDiagramLayout(model), group = layout.groups[0]!, card = layout.nodes[0]!;
    const lastBaseline = group.y + 24 + (wrapText(group.group.label, group.width - 34, 12).length - 1) * 17;
    expect(lastBaseline + 10).toBeLessThan(card.y);
  });
  it('lays out a representative 40 node graph in bounded time', () => {
    const nodes = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, label: `Service ${i}`, shape: 'card' as const, color: 'blue' as const, line: i + 1, at: [(i % 8) + 1, Math.floor(i / 8) + 1] as [number, number] }));
    const model: DiagramModel = { kind: 'system', direction: 'LR', title: 'Forty services', nodes, groups: [], diagnostics: [], edges: nodes.slice(1).filter((_, i) => (i + 1) % 8).map(n => ({ from: `n${Number(n.id.slice(1)) - 1}`, to: n.id, label: 'HTTPS', style: 'solid' as const, bidirectional: false, line: 50 })) };
    const started = performance.now(); const layout = computeDiagramLayout(model);
    expect(performance.now() - started).toBeLessThan(1500);
    assertGeometry(layout);
  });
});
