import { describe, expect, it } from "vitest";
import { parse } from "../src/parser-entry.js";
import { computeLayout } from "../src/layout.js";
import { buildEdgePaths } from "../src/views/svg.js";

describe("orthogonal routing", () => {
  it("bends (4 points) when endpoints are not aligned on the flow axis", () => {
    // A and B share rank 0 (stacked at different y); both point at C in rank 1.
    const m = parse(`graph LR
      A[a] --> C[c]
      B[b] --> C
    `);
    const layout = computeLayout(m);
    const bent = layout.edges.find((e) => e.from === "B" && e.to === "C")!;
    expect(bent.points.length).toBe(4);
    // Right-angle: the two mid points share x (the vertical run).
    expect(bent.points[1].x).toBeCloseTo(bent.points[2].x);
  });

  it("stays straight (2 points) when endpoints are aligned", () => {
    const m = parse(`graph LR\nA[a] --> B[b]`);
    const layout = computeLayout(m);
    expect(layout.edges[0].points.length).toBe(2);
  });
});

describe("cross-lane routing via top/bottom faces", () => {
  it("connects a cross-zone edge to the target's top or bottom face", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      ---
      nodes:
        A: { zone: client }
        B: { zone: gcp }
    `);
    const layout = computeLayout(m);
    const b = layout.nodes.find((n) => n.id === "B")!;
    const edge = layout.edges[0];
    const end = edge.points[edge.points.length - 1];
    // Target entry sits on a horizontal (top/bottom) face, not a side face.
    const onTopOrBottom = Math.abs(end.y - b.y) < 0.5 || Math.abs(end.y - (b.y + b.h)) < 0.5;
    expect(onTopOrBottom).toBe(true);
  });

  it("keeps a same-lane edge on the side (left/right) faces", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      ---
      nodes:
        A: { zone: gcp }
        B: { zone: gcp }
    `);
    const layout = computeLayout(m);
    const b = layout.nodes.find((n) => n.id === "B")!;
    const end = layout.edges[0].points[layout.edges[0].points.length - 1];
    // Same lane => enters the left face (x == b.x).
    expect(Math.abs(end.x - b.x) < 0.5).toBe(true);
  });
});

describe("crossing jumps (buildEdgePaths)", () => {
  it("breaks the horizontal line where a vertical of another edge crosses", () => {
    const edges = [
      { id: "h", points: [{ x: 0, y: 50 }, { x: 200, y: 50 }] },
      { id: "v", points: [{ x: 100, y: 0 }, { x: 100, y: 100 }] },
    ];
    const paths = buildEdgePaths(edges, 7);
    // Horizontal gets a gap => its path restarts (two "M" subpaths).
    expect(paths.get("h")!.match(/M /g)!.length).toBe(2);
    // Vertical passes through continuously => single subpath.
    expect(paths.get("v")!.match(/M /g)!.length).toBe(1);
    // The gap straddles the crossing x=100 by the gap width.
    expect(paths.get("h")).toContain("93.0");
    expect(paths.get("h")).toContain("107.0");
  });

  it("does not break at a same-edge corner", () => {
    // A single L-shaped edge: its own corner must not create a gap.
    const edges = [{ id: "L", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }] }];
    const paths = buildEdgePaths(edges, 7);
    expect(paths.get("L")!.match(/M /g)!.length).toBe(1);
  });
});
