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
  it('keeps the API to database route straight and places the left branch on its left', () => {
    const model = parseDiagram(DIAGRAM_SAMPLES.find(s => s.id === 'system')!.source);
    const layout = computeDiagramLayout(model);
    const database = layout.edges.find(e => e.edge.to === 'database')!;
    const queue = layout.edges.find(e => e.edge.to === 'queue')!;
    expect(database.points).toHaveLength(2);
    expect(database.points[0]!.x).toBe(database.points[1]!.x);
    expect(queue.points).toHaveLength(4);
    expect(queue.points[0]!.x).toBeLessThan(database.points[0]!.x);
    expect(queue.points.every(p => p.x < database.points[0]!.x)).toBe(true);
    expect(renderDiagram(model).model.diagnostics).toEqual([]);
    assertGeometry(layout);
  });
  it('uses diamond side vertices and terminal side ports for symmetric activity branches', () => {
    const model = parseDiagram(DIAGRAM_SAMPLES.find(s => s.id === 'activity')!.source);
    const layout = computeDiagramLayout(model);
    const decision = layout.nodes.find(n => n.node.id === 'available')!;
    const finish = layout.nodes.find(n => n.node.id === 'finish')!;
    const branches = layout.edges.filter(e => e.edge.from === 'available');
    const merges = layout.edges.filter(e => e.edge.to === 'finish');
    for (const edge of [...branches, ...merges]) expect(edge.points).toHaveLength(3);
    expect(branches.map(e => e.points[0]!.x).sort((a,b) => a-b)).toEqual([decision.x, decision.x + decision.width]);
    expect(branches.every(e => e.points[0]!.y === decision.y + decision.height / 2)).toBe(true);
    expect(merges.map(e => e.points[e.points.length - 1]!.x).sort((a,b) => a-b)).toEqual([finish.x, finish.x + finish.width]);
    expect(merges.every(e => e.points[e.points.length - 1]!.y === finish.y + finish.height / 2)).toBe(true);
    assertGeometry(layout);
  });
  it('assigns graph ports and paths independently of edge declaration order', () => {
    for (const kind of ['system', 'activity', 'layers']) {
      const model = parseDiagram(DIAGRAM_SAMPLES.find(s => s.id === kind)!.source);
      const normal = computeDiagramLayout(model);
      const reversed = computeDiagramLayout({ ...model, edges: [...model.edges].reverse() });
      for (const edge of normal.edges) expect(reversed.edges.find(e => e.edge === edge.edge)).toEqual(edge);
    }
  });
  it('keeps the same primary and outer routes when parallel declarations are reordered', () => {
    const model = parseDiagram('diagram system\nnode a "A"\nnode b "B"\na -> b "request"\na --> b "event"\na -> b "second"');
    const normal = computeDiagramLayout(model);
    const reversed = computeDiagramLayout({ ...model, edges: [...model.edges].reverse() });
    for (const edge of normal.edges) expect(reversed.edges.find(e => e.edge === edge.edge)).toEqual(edge);
    assertGeometry(normal);
  });
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
  it('connects a reverse screen transition to its action row', () => {
    const model = parseDiagram(`diagram screens
node a "A" at=1,1
node b "B" at=2,1
a -> b "進む"
b -> a "戻る"`), layout = computeDiagramLayout(model);
    assertGeometry(layout, 'screens');
    const reverse = layout.edges[1]!;
    expect(reverse.points.length).toBeGreaterThan(2);
    expect(reverse.labelBox).toBeUndefined();
    const source = layout.nodes[1]!, action = source.screen!.actions[0]!;
    expect(reverse.points[0]).toEqual({ x: source.x + source.width, y: source.y + action.top + action.height / 2 });
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

it('routes icon nodes around labels, preserves groups, and falls back when icons are missing', () => {
  const source = `diagram system LR
style icons
group cloud "Cloud"
node api "API" icon=server group=cloud at=1,1
node db "Primary Database" shape=database group=cloud at=2,1
node worker "Worker" icon=missing/service group=cloud at=1,2
api -> db "SQL"
api -> worker "Jobs"
worker -> worker "Retry"`;
  const result = renderDiagram(parseDiagram(source));
  expect(result.model.diagnostics).toEqual([]);
  assertGeometry(result.layout);
  expect(result.svg.match(/archmap-icon-node/g)).toHaveLength(3);
  const [api, db] = result.layout.nodes;
  const sql = result.layout.edges[0];
  expect(sql.points[0]).toEqual({ x: api.x + api.width / 2 + 24, y: api.y + 24 });
  expect(sql.points[sql.points.length - 1]).toEqual({ x: db.x + db.width / 2 - 24, y: db.y + 24 });
  const cards = renderDiagram(parseDiagram(source.replace('style icons', 'style cards')));
  expect(cards.svg).not.toContain('archmap-icon-node');
  expect(api.width).toBeLessThan(cards.layout.nodes[0].width);
});

it('allocates room for long icon captions and keeps semantic shapes', () => {
  const model = parseDiagram(`diagram system TD\nstyle icons\nnode a "非常に長い日本語のコンポーネント名を表示する" description="複数行になる長い説明文も余白を確保して表示する"\nnode b "判断" shape=decision\na -> b`);
  const result = renderDiagram(model);
  assertGeometry(result.layout);
  expect(result.layout.nodes[0].height).toBeGreaterThan(130);
  expect(result.layout.nodes[1].iconMode).toBeUndefined();
  const layers = DIAGRAM_SAMPLES.find(s => s.id === 'layers')!.source.replace(/(diagram[^\n]*\n)/, '$1style icons\n');
  assertGeometry(renderDiagram(parseDiagram(layers)).layout, 'layers');
});

it('places borderless sequence labels at the sender and aligns multiline replies to the right', () => {
  const result = renderDiagram(parseDiagram(`diagram sequence
node a "Client"
node b "API"
a -> b "Request"
b --> a "Response\\nDetails"
b -> b "Retry"
a -> b`));
  const [request, reply, self, unlabeled] = result.layout.edges;
  expect(request.labelBox!.x).toBe(request.points[0].x + 12);
  expect(reply.labelBox!.x + reply.labelBox!.width).toBe(reply.points[0].x - 12);
  expect(self.labelBox!.x).toBe(self.points[0].x + 12);
  expect(unlabeled.labelBox).toBeUndefined();
  const labels = [...result.svg.matchAll(/<g class="archmap-edge-label">(.*?)<\/g>/g)].map(match => match[1]);
  expect(labels).toHaveLength(3);
  expect(labels.every(label => !label.includes('<rect'))).toBe(true);
  expect(labels[0]).toContain('text-anchor="start"');
  expect(labels[1]).toContain('text-anchor="end"');
  expect(labels[1].match(/<tspan/g)).toHaveLength(2);
  expect(labels[2]).toContain('text-anchor="start"');
  assertGeometry(result.layout, 'sequence');
  const system = renderDiagram(parseDiagram('diagram system\nnode a "A"\nnode b "B"\na -> b "Request"'));
  expect(system.svg).toContain('<g class="archmap-edge-label"><rect');
});

it('builds ordered screen actions with row ports, wrapping, self transitions and bidirectional transitions', () => {
  const model = parseDiagram(`diagram screens LR
node a "ホーム" icon=browser at=1,1
node b "商品詳細" at=2,1
node c "完了" at=2,2
a -> b "商品を選ぶ"
a -> b "別の条件で選ぶ"
a -> a "絞り込む"
b <-> a "切り替え"
b -> c
b -> c "非常に長い日本語のアクション名を複数行に折り返して表示する"`);
  const result = renderDiagram(model), layout = result.layout;
  assertGeometry(layout, 'screens');
  expect(result.model.diagnostics).toEqual([]);
  expect(layout.nodes[0].screen!.actions.map(a => a.label)).toEqual(['商品を選ぶ', '別の条件で選ぶ', '絞り込む', '切り替え']);
  expect(layout.nodes[1].screen!.actions.map(a => a.label)).toEqual(['切り替え', '完了へ', '非常に長い日本語のアクション名を複数行に折り返して表示する']);
  const long = layout.nodes[1].screen!.actions[2];
  expect(long.lines.length).toBeGreaterThan(1);
  expect(layout.nodes[2].screen!.actions).toEqual([]);
  expect(result.svg).toContain('遷移の定義なし');
  expect(result.svg).not.toContain('class="archmap-edge-label"');
  for (const node of layout.nodes) for (const action of node.screen!.actions) {
    const edge = layout.edges.find(e => e.edge === action.edge)!;
    const point = action.edge.from === node.node.id ? edge.points[0] : edge.points[edge.points.length - 1];
    expect(point.y).toBe(node.y + action.top + action.height / 2);
    expect(action.top + action.height).toBeLessThan(node.height);
  }
  const reversed = computeDiagramLayout({ ...model, edges: [...model.edges].reverse() });
  expect(reversed.nodes[0].screen!.actions.map(a => a.label)).toEqual([...layout.nodes[0].screen!.actions].reverse().map(a => a.label));
});

it('retains labeled decisions alongside screen action lists', () => {
  const result = renderDiagram(parseDiagram(`diagram screens TD
node form "入力画面" at=1,1
node decision "有効？" shape=decision at=1,2
node done "完了画面" at=1,3
form -> decision "送信"
decision -> done "はい"`));
  assertGeometry(result.layout, 'screens');
  expect(result.layout.edges[0].labelBox).toBeUndefined();
  expect(result.layout.edges[1].labelBox).toBeDefined();
});

it('connects calls and responses to activation borders including nested self calls', () => {
  const model = parseDiagram(`diagram sequence
node client "Client"
node api "API"
client -> api "Request"
activate api
api -> api "Nested"
activate api
api -> api "Work"
deactivate api
api --> client "Response"
deactivate api`);
  expect(model.diagnostics).toEqual([]);
  const result = renderDiagram(model), [outer, inner] = result.layout.activations!;
  const [request, nested, work, response] = result.layout.edges;
  expect(outer.y).toBe(request.points[1].y);
  expect(request.points[1].x).toBe(outer.x);
  expect(nested.points[0].x).toBe(outer.x + outer.width);
  expect(nested.points[3].x).toBe(inner.x + inner.width);
  expect(work.points[0].x).toBe(inner.x + inner.width);
  expect(response.points[0].x).toBe(outer.x);
  expect(outer.y + outer.height).toBeGreaterThan(response.points[0].y);
  expect(inner.x).toBeGreaterThan(outer.x);
  expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height);
  expect(result.svg.match(/class="archmap-activation"/g)).toHaveLength(2);
  expect(result.svg.indexOf('class="archmap-activation"')).toBeLessThan(result.svg.indexOf('class="archmap-edge"'));
  expect(result.svg).not.toContain('<g class="archmap-edge-label"><rect');
  assertGeometry(result.layout, 'sequence');
});

it('keeps consecutive empty activation intervals separate and before following messages', () => {
  const model = parseDiagram(`diagram sequence
node a "A"
node b "B"
activate a
deactivate a
activate a
deactivate a
a -> b`);
  const layout = computeDiagramLayout(model), [first, second] = layout.activations!;
  expect(first.height).toBeGreaterThan(0);
  expect(second.y).toBeGreaterThan(first.y + first.height);
  expect(layout.edges[0].points[0].y).toBeGreaterThan(second.y + second.height);
  expect(layout.edges[0].points[0].x).toBe(layout.nodes[0].x + layout.nodes[0].width / 2);
  expect(computeDiagramLayout(parseDiagram('diagram sequence\nnode a "A"')).activations).toBeUndefined();
});

it('keeps forward and return screen transitions on separate tracks', () => {
  const sources = [DIAGRAM_SAMPLES.find(sample => sample.id === 'screens')!.source, `diagram screens
node a "A" at=1,1
node b "B" at=2,1
node c "C" at=3,1
a -> c "Jump"
b -> c "Forward"
c -> b "Return"`, `diagram screens
node a "A" at=1,1
node b "B" at=2,1
node c "C" at=3,1
a -> c "Forward"
c -> b "Other arrival"`];
  for (const source of sources) {
    const layout = computeDiagramLayout(parseDiagram(source));
    assertGeometry(layout, 'screens');
    for (const [index, edge] of layout.edges.entries()) for (const other of layout.edges.slice(index + 1)) {
      for (let i = 1; i < edge.points.length; i++) for (let j = 1; j < other.points.length; j++) {
        const a = edge.points[i - 1], b = edge.points[i], c = other.points[j - 1], d = other.points[j];
        const horizontal = a.y === b.y && c.y === d.y && a.y === c.y;
        const vertical = a.x === b.x && c.x === d.x && a.x === c.x;
        const overlap = horizontal ? Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x)) - Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)) : vertical ? Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)) - Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)) : 0;
        expect(overlap, `${edge.edge.label} overlaps ${other.edge.label}`).toBeLessThanOrEqual(0);
      }
    }
  }
});

it('reserves fragment headings and separators around messages and nested frames', () => {
  const model = parseDiagram(`diagram sequence
node a "Client"
node b "API"
a -> b "Request"
activate b
loop "Each request"
alt "Allowed"
b -> b "Check"
opt "Notify"
b --> a "Notification"
end
else "Denied"
b --> a "Error"
end
end
deactivate b`);
  expect(model.diagnostics).toEqual([]);
  const result = renderDiagram(model), layout = result.layout;
  const [loop, alt, opt] = layout.fragments!;
  expect(alt.x).toBeGreaterThan(loop.x);
  expect(alt.x + alt.width).toBeLessThan(loop.x + loop.width);
  expect(alt.y).toBeGreaterThanOrEqual(loop.y + loop.headerHeight);
  expect(alt.y + alt.height).toBeLessThan(loop.y + loop.height);
  expect(opt.y + opt.height).toBeLessThan(alt.branches[0].y);
  for (const frame of layout.fragments!) {
    expect(frame.height).toBeGreaterThan(frame.headerHeight);
    expect(frame.y + frame.height).toBeLessThan(layout.height);
    const headers = [{ x:frame.x,y:frame.y,width:frame.width,height:frame.headerHeight }, ...frame.branches.map(branch=>({x:frame.x,y:branch.y,width:frame.width,height:branch.height}))];
    for (const edge of layout.edges) for (const header of headers) {
      if (edge.labelBox) expect(boxesOverlap(header, edge.labelBox)).toBe(false);
      for (let i=1;i<edge.points.length;i++) expect(segmentIntersectsBox(edge.points[i-1],edge.points[i],header)).toBe(false);
    }
  }
  expect(result.svg).toContain('data-kind="alt"');
  expect(result.svg).toContain('archmap-fragment-separator');
  expect(layout.activations![0].y).toBeLessThan(loop.y);
  expect(layout.activations![0].y + layout.activations![0].height).toBeGreaterThan(loop.y + loop.height);
  assertGeometry(layout,'sequence');
});

it('contains long conditions, empty branches, and self loops on the final participant', () => {
  const model = parseDiagram(`diagram sequence\nnode a "A"\nalt "${'長い条件'.repeat(25)}"\nopt "Nested"\na -> a "Self call"\nend\nelse\nend`);
  const layout = computeDiagramLayout(model);
  expect(model.diagnostics).toEqual([]);
  for (const frame of layout.fragments!) {
    expect(frame.x + frame.width).toBeLessThan(layout.width);
    expect(frame.height).toBeGreaterThan(frame.headerHeight);
  }
  const edge = layout.edges[0];
  expect(Math.max(...edge.points.map(p=>p.x))).toBeLessThan(layout.fragments![1].x + layout.fragments![1].width);
});

it('contains nested group bounds and titles without treating ancestors as collisions', () => {
  for (const kind of ['system','layers','screens','activity']) for (const style of kind==='system' || kind==='layers' ? ['cards','icons'] : ['cards']) {
    const model = parseDiagram(`diagram ${kind}\nstyle ${style}
group private "Private subnet" parent=vpc color=green
group public "Public subnet" parent=vpc
group vpc "Production VPC" parent=region
group region "Tokyo Region" parent=cloud
group cloud "AWS Cloud"
group external "External"
node api "API" group=public icon=server
node db "Database" group=private icon=database
node other "Other" group=external
api -> db "SQL"`);
    const result=renderDiagram(model),layout=result.layout;
    expect(result.model.diagnostics).toEqual([]);
    assertGeometry(layout,kind);
    expect(layout.groups.map(g=>g.group.id)).toEqual(['cloud','region','vpc','private','public','external']);
    for(const child of layout.groups) {
      expect(child.x).toBeGreaterThanOrEqual(0);expect(child.y).toBeGreaterThanOrEqual(0);
      expect(child.x+child.width).toBeLessThanOrEqual(layout.width);expect(child.y+child.height).toBeLessThanOrEqual(layout.height);
      if(child.group.parent) {
        const parent=layout.groups.find(g=>g.group.id===child.group.parent)!;
        expect(child.x).toBeGreaterThan(parent.x);
        expect(child.x+child.width).toBeLessThan(parent.x+parent.width);
        expect(child.y).toBeGreaterThan(parent.y+24+wrapText(parent.group.label,parent.width-34,12).length*17);
        expect(child.y+child.height).toBeLessThan(parent.y+parent.height);
      }
    }
    expect(result.svg.indexOf('data-group="cloud"')).toBeLessThan(result.svg.indexOf('data-group="private"'));
  }
});

it('retains overlap warnings for unrelated groups while containing eight levels and long labels', () => {
  const deep = parseDiagram(`diagram system\nstyle icons\n${Array.from({length:8},(_,i)=>`group g${i} "${'長い境界名'.repeat(5)}"${i ? ` parent=g${i-1}` : ''}`).join('\n')}\nnode api "API" group=g7`);
  const result=renderDiagram(deep);
  expect(result.model.diagnostics).toEqual([]);
  expect(result.layout.groups).toHaveLength(8);
  expect(result.layout.groups.every(g=>g.y>=0 && g.x>=0 && g.y+g.height<=result.layout.height)).toBe(true);
  const conflict=renderDiagram(parseDiagram(`diagram system
group root "Root"
group child "Child" parent=root
group other "Other"
node a "A" group=child at=1,1
node b "B" group=child at=3,1
node c "C" group=other at=2,1`));
  expect(conflict.model.diagnostics.some(d=>d.severity==='warning' && d.message.includes('領域'))).toBe(true);
});
