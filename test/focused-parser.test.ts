import { describe, expect, it } from "vitest";
import { DIAGRAM_LIMITS, parseDiagram } from "../src/focused/parser.js";
import { DIAGRAM_SAMPLES } from "../src/focused/samples.js";
import { DIAGRAM_KINDS } from "../src/focused/types.js";

const errors = (source: string) => parseDiagram(source).diagnostics;

describe("focused diagram parser", () => {
  it("parses all five published samples without diagnostics", () => {
    expect(DIAGRAM_SAMPLES.map((sample) => sample.id)).toEqual([...DIAGRAM_KINDS]);
    for (const sample of DIAGRAM_SAMPLES) {
      const model = parseDiagram(sample.source);
      expect(model.diagnostics, sample.id).toEqual([]);
      expect(model.kind).toBe(sample.id);
      expect(model.nodes.length).toBeGreaterThanOrEqual(4);
      expect(model.edges.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["system", "LR"], ["layers", "TD"], ["sequence", "LR"], ["screens", "LR"], ["activity", "TD"],
  ])("defaults %s to %s", (kind, direction) => {
    const model = parseDiagram(`diagram ${kind}\nnode one "One"`);
    expect(model.direction).toBe(direction);
    expect(model.diagnostics).toEqual([]);
  });

  it("accepts every node option and a forward group reference", () => {
    const model = parseDiagram(`diagram system TD
title "クラウド構成"
node _api-v2 "API" description="first line\\nsecond line" icon=aws/lambda group=backend at=2,3 shape=database color=green
group backend "Backend" color=purple`);
    expect(model.diagnostics).toEqual([]);
    expect(model.nodes[0]).toEqual({ id: "_api-v2", label: "API", description: "first line\nsecond line", icon: "aws/lambda", group: "backend", at: [2, 3], shape: "database", color: "green", line: 3 });
    expect(model.groups[0]).toMatchObject({ id: "backend", color: "purple", line: 4 });
    expect(model.title).toBe("クラウド構成");
  });

  it("decodes only the documented string escapes and preserves comment markers in strings", () => {
    const model = parseDiagram(String.raw`# comment before the header
diagram system // header comment
node first "Say \"hello\"\\path\n# and // are text" description="https://example.test/#top" # trailing comment
node second "Second"
first->second "Message // #"`);
    expect(model.diagnostics).toEqual([]);
    expect(model.nodes[0].label).toBe('Say "hello"\\path\n# and // are text');
    expect(model.nodes[0].description).toBe("https://example.test/#top");
    expect(model.edges[0].label).toBe("Message // #");
  });

  it("supports CRLF, a BOM, blank lines, and actual declaration line numbers", () => {
    const model = parseDiagram('\uFEFF\r\n// note\r\ndiagram system\r\n\r\nnode a "A"\r\n');
    expect(model.diagnostics).toEqual([]);
    expect(model.nodes[0].line).toBe(5);
  });

  it("preserves edges and node order, including forward references, parallel edges and loops", () => {
    const model = parseDiagram(`diagram sequence
second -> first "request"
node first "First"
node second "Second"
first --> second "response"
second <-> first "duplex"
first -> first "self"`);
    expect(model.diagnostics).toEqual([]);
    expect(model.nodes.map((node) => node.id)).toEqual(["first", "second"]);
    expect(model.edges.map(({ from, to, style, bidirectional }) => [from, to, style, bidirectional])).toEqual([
      ["second", "first", "solid", false], ["first", "second", "dashed", false],
      ["second", "first", "solid", true], ["first", "first", "solid", false],
    ]);
  });

  it("treats reserved command names and prototype properties as ordinary reference IDs", () => {
    const model = parseDiagram(`diagram system
node title "Title"
node __proto__ "Prototype"
node constructor "Constructor"
node diagram "Diagram"
node node "Node"
node group "Group"
title -> __proto__
__proto__ -> constructor
constructor -> diagram
diagram -> node
node -> group
group -> title`);
    expect(model.diagnostics).toEqual([]);
    expect(model.edges).toHaveLength(6);
    expect({}).not.toHaveProperty("polluted");
  });

  it.each([
    ["", 1],
    ['node a "A"', 1],
    ['diagram topology\nnode a "A"', 1],
    ['diagram system RL\nnode a "A"', 1],
    ['diagram "system"\nnode a "A"', 1],
    ['diagram system\nnode a "A"\ndiagram layers', 3],
    ['diagram system\nnode 9a "A"', 2],
    ['diagram system\nnode 日本語 "A"', 2],
    ['diagram system\nnode a A', 2],
    ['diagram system\nnode a ""', 2],
    ['diagram system\nnode a "unterminated', 2],
    [String.raw`diagram system
node a "bad\t"`, 2],
    ['diagram system\nnode a "A" extra=value', 2],
    ['diagram system\nnode a "A" color=red', 2],
    ['diagram system\nnode a "A" color="blue"', 2],
    ['diagram system\nnode a "A" color=blue color=green', 2],
    ['diagram system\nnode a "A" description=plain', 2],
    ['diagram system\nnode a "A" shape=circle', 2],
    ['diagram system\nnode a "A" at=0,1', 2],
    ['diagram system\nnode a "A" at=1.5,1', 2],
    ['diagram system\nnode a "A" at=1,13', 2],
    ['diagram system\nnode a "A" at=1, 2', 2],
    ['diagram system\nnode a "A" at=1,1\nnode b "B" at=1,1', 3],
    ['diagram system\nnode a "A"\nnode a "Again"', 3],
    ['diagram system\nnode a "A"\ngroup a "Again"', 3],
    ['diagram system\nnode a "A" group=missing', 2],
    ['diagram system\nnode a "A"\na -> missing', 3],
    ['diagram system\nnode a "A"\nmissing -> a', 3],
    ['diagram system\nnode a "A"\na -> a unquoted', 3],
    ['diagram system\nnode a "A"\na -> a "yes" extra', 3],
    ['diagram system\nnode a "A"\ntitle "one"\ntitle "two"', 4],
    ['diagram system\nnode a "A"\ntitle "one" extra', 3],
    ['diagram system\nnode a "A"\nunknown syntax', 3],
    ['diagram system\nnode a "A"\na => a', 3],
  ])("reports invalid syntax on its actual source line: %s", (source, line) => {
    expect(errors(source).some((diagnostic) => diagnostic.line === line && diagnostic.severity === "error")).toBe(true);
  });

  it.each([
    'diagram sequence TD\nnode a "A"',
    'diagram sequence\ngroup g "G"\nnode a "A"',
    'diagram sequence\nnode a "A" group=g',
    'diagram sequence\nnode a "A" at=1,1',
    'diagram sequence\nnode a "A" shape=database',
  ])("rejects unsupported sequence layout features: %s", (source) => {
    expect(errors(source).some((diagnostic) => diagnostic.message.includes("sequence"))).toBe(true);
  });

  it("accepts explicit sequence LR and card shape", () => {
    expect(errors('diagram sequence LR\nnode a "A" shape=card')).toEqual([]);
  });

  it.each([
    'diagram layers LR\nnode a "A"',
    'diagram layers\nnode a "A" at=1,1',
  ])("rejects unsupported layer positioning: %s", (source) => {
    expect(errors(source).some((diagnostic) => diagnostic.message.includes("layers"))).toBe(true);
  });

  it("keeps HTML-like label content as inert model text", () => {
    const model = parseDiagram(`diagram system
node a "<script>alert('x')</script>" description="<img src=x onerror=alert(1)>"`);
    expect(model.diagnostics).toEqual([]);
    expect(model.nodes[0].label).toBe("<script>alert('x')</script>");
    expect(model.nodes[0].description).toBe("<img src=x onerror=alert(1)>");
  });

  it.each(["decision", "start", "end"])("rejects icons that cannot render on centered %s nodes", (shape) => {
    expect(errors(`diagram activity\nnode a "A" shape=${shape} icon=cloud`).some((diagnostic) => diagnostic.line === 2 && diagnostic.message.includes("icon"))).toBe(true);
  });

  it.each([0x00, 0x01, 0x08, 0x0b, 0x0c, 0x0e, 0x1f, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xfffe, 0xffff])("rejects XML-invalid text code point %i", (code) => {
    const character = String.fromCharCode(code);
    for (const statement of [`title "bad${character}"`, `group g "bad${character}"`, `node a "bad${character}"`, `node a "A" description="bad${character}"`, `a -> a "bad${character}"`]) {
      const model = parseDiagram(`diagram system\nnode valid "Valid"\n${statement}`);
      expect(model.diagnostics.some((diagnostic) => diagnostic.line === 3 && diagnostic.message.includes("SVG/XML"))).toBe(true);
    }
  });

  it("preserves valid supplementary Unicode and tab characters", () => {
    const model = parseDiagram('diagram system\nnode a "注文 📦 𠮷" description="\tA\\nB"');
    expect(model.diagnostics).toEqual([]);
    expect(model.nodes[0].label).toBe("注文 📦 𠮷");
    expect(model.nodes[0].description).toBe("\tA\nB");
  });

  it.each([
    'diagram system\nnode a "A" icon=<svg>',
    'diagram system\nnode a "A" icon="<svg onload=alert(1) />"',
    'diagram system\nnode a "A" onclick=alert(1)',
    'diagram system\n<script>alert(1)</script>',
    'diagram system\nnode a "A" icon=javascript:alert(1)',
  ])("rejects executable syntax or unsafe icon keys: %s", (source) => {
    expect(errors(source).length).toBeGreaterThan(0);
  });

  it("allows provider service icons and future safe registry keys", () => {
    for (const icon of ["aws/lambda", "gcp/cloud_run", "azure/app_services", "custom:v2.service"]) {
      const model = parseDiagram(`diagram system\nnode a "A" icon=${icon}`);
      expect(model.diagnostics).toEqual([]);
      expect(model.nodes[0].icon).toBe(icon);
    }
  });

  it("bounds source, nodes, groups, edges, text, and diagnostics", () => {
    const oversized = parseDiagram("x".repeat(DIAGRAM_LIMITS.sourceLength + 1));
    expect(oversized.nodes).toEqual([]);
    expect(oversized.diagnostics).toHaveLength(1);
    const nodeSource = Array.from({ length: DIAGRAM_LIMITS.nodes + 1 }, (_, i) => `node n${i} "Node ${i}"`).join("\n");
    const nodes = parseDiagram(`diagram system\n${nodeSource}`);
    expect(nodes.nodes).toHaveLength(DIAGRAM_LIMITS.nodes);
    expect(nodes.diagnostics).toHaveLength(1);
    const groupSource = Array.from({ length: DIAGRAM_LIMITS.groups + 1 }, (_, i) => `group g${i} "Group ${i}"`).join("\n");
    const groups = parseDiagram(`diagram system\nnode a "A"\n${groupSource}`);
    expect(groups.groups).toHaveLength(DIAGRAM_LIMITS.groups);
    expect(groups.diagnostics).toHaveLength(1);
    const edges = parseDiagram(`diagram system\nnode a "A"\n${"a -> a\n".repeat(DIAGRAM_LIMITS.edges + 1)}`);
    expect(edges.edges).toHaveLength(DIAGRAM_LIMITS.edges);
    expect(edges.diagnostics).toHaveLength(1);
    expect(errors(`diagram system\nnode a "${"a".repeat(DIAGRAM_LIMITS.labelLength + 1)}"`).length).toBeGreaterThan(0);
    expect(errors(`diagram system\nnode a "A" description="${"a".repeat(DIAGRAM_LIMITS.descriptionLength + 1)}"`).length).toBeGreaterThan(0);
    expect(errors(`diagram system\n${"invalid\n".repeat(1000)}`)).toHaveLength(DIAGRAM_LIMITS.diagnostics);
  });

  it("never throws while the user types incomplete statements", () => {
    const sample = DIAGRAM_SAMPLES[0].source;
    for (let length = 0; length <= sample.length; length += 1) {
      expect(() => parseDiagram(sample.slice(0, length))).not.toThrow();
    }
  });
});

it('accepts icon style only for architecture diagrams and rejects ambiguous declarations', () => {
  for (const kind of ['system', 'layers']) {
    const model = parseDiagram(`diagram ${kind}\nstyle icons\nnode api "API"`);
    expect(model.style).toBe('icons'); expect(model.diagnostics).toEqual([]);
  }
  for (const kind of ['sequence', 'screens', 'activity']) expect(errors(`diagram ${kind}\nstyle icons\nnode api "API"`).length).toBeGreaterThan(0);
  for (const declaration of ['style other', 'style "icons"', 'style icons extra', 'style cards\nstyle icons']) expect(errors(`diagram system\n${declaration}\nnode api "API"`).length).toBeGreaterThan(0);
  expect(errors('diagram system\nstyle icons\nnode style "Style"\nnode api "API"\nstyle -> api')).toEqual([]);
});

it('parses explicit nested activations and preserves their message positions', () => {
  const model = parseDiagram(`diagram sequence
node a "Client"
node b "API"
a -> b
activate b
b -> b
activate b
deactivate b
b --> a
deactivate b`);
  expect(model.diagnostics).toEqual([]);
  expect(model.activationEvents!.map(event => [event.action, event.node, event.afterEdge])).toEqual([
    ['activate', 'b', 1], ['activate', 'b', 2], ['deactivate', 'b', 2], ['deactivate', 'b', 3],
  ]);
  expect(errors('diagram sequence\nactivate a\nnode a "A"\ndeactivate a')).toEqual([]);
  expect(errors('diagram sequence\nnode activate "A"\nnode deactivate "B"\nactivate -> deactivate')).toEqual([]);
});

it.each([
  'diagram system\nnode a "A"\nactivate a',
  'diagram sequence\nnode a "A"\nactivate missing\ndeactivate missing',
  'diagram sequence\nnode a "A"\nactivate a',
  'diagram sequence\nnode a "A"\ndeactivate a',
  'diagram sequence\nnode a "A"\nactivate "a"',
  'diagram sequence\nnode a "A"\nactivate a extra',
  `diagram sequence\nnode a "A"\n${'activate a\n'.repeat(9)}${'deactivate a\n'.repeat(9)}`,
  `diagram sequence\nnode a "A"\n${'activate a\ndeactivate a\n'.repeat(101)}`,
])('rejects invalid or excessive activation declarations: %s', source => {
  expect(errors(source).some(d => d.severity === 'error' && d.line > 1)).toBe(true);
});

it('supports nested sequence fragments, guarded else branches, and keyword node IDs', () => {
  const model = parseDiagram(`diagram sequence
node a "A"
node end "B"
loop "各注文"
alt "在庫あり"
a -> end
opt "通知する"
end --> a
end
else "在庫なし"
end --> a
else
end
end`);
  expect(model.diagnostics).toEqual([]);
  expect(model.fragmentEvents!.map(event => event.action)).toEqual(['loop','alt','opt','end','else','else','end','end']);
  expect(model.fragmentEvents![5].label).toBe('その他');
});

it.each([
  'alt "open"', 'else "orphan"', 'end', 'alt unquoted\nend', 'opt "x"\nelse\nend',
  'loop "x"\nend "extra"', `${'opt "nested"\n'.repeat(5)}${'end\n'.repeat(5)}`,
  `${'opt "x"\nend\n'.repeat(65)}`,
  'alt "x"\nactivate a\nelse\ndeactivate a\nend',
  'activate a\nopt "x"\ndeactivate a\nactivate a\nend\ndeactivate a',
])('rejects malformed fragments and activations across branch boundaries: %s', fragment => {
  expect(errors(`diagram sequence\nnode a "A"\n${fragment}`).some(d => d.severity === 'error')).toBe(true);
});
it('rejects fragments outside sequences and allows an activation enclosing a whole fragment', () => {
  expect(errors('diagram system\nnode a "A"\nalt "x"\nend').length).toBeGreaterThan(0);
  expect(errors('diagram sequence\nnode a "A"\nactivate a\nalt "x"\nelse\nend\ndeactivate a')).toEqual([]);
});

it('accepts parent groups declared later and nesting across non-sequence diagram kinds', () => {
  for (const kind of ['system','layers','screens','activity']) {
    const model = parseDiagram(`diagram ${kind}\ngroup subnet "Subnet" parent=vpc\ngroup vpc "VPC" parent=cloud\ngroup cloud "Cloud"\nnode api "API" group=subnet`);
    expect(model.diagnostics).toEqual([]);
    expect(model.groups[0].parent).toBe('vpc');
  }
});
it.each([
  'group a "A" parent=missing',
  'group a "A" parent=a',
  'group a "A" parent=b\ngroup b "B" parent=a',
  'group a "A" parent=api',
  'group a "A" parent="b"\ngroup b "B"',
  Array.from({length:9},(_,i)=>`group g${i} "Group"${i ? ` parent=g${i-1}` : ''}`).join('\n'),
])('rejects invalid group nesting: %s', groups => {
  expect(errors(`diagram system\nnode api "API"\n${groups}`).some(d=>d.severity==='error')).toBe(true);
});
