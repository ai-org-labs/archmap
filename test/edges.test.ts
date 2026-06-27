import { describe, expect, it } from "vitest";
import { parse } from "../src/parser-entry.js";
import { computeLayout } from "../src/layout.js";
import { buildEdgePaths } from "../src/views/svg.js";

function pathSegments(d: string): Array<{ orient: "h" | "v" | "diag"; len: number }> {
  const tokens = [...d.matchAll(/[ML]|-?\d+(?:\.\d+)?/g)].map((m) => m[0]);
  let cmd: string | null = null;
  let current: { x: number; y: number } | null = null;
  const segs: Array<{ orient: "h" | "v" | "diag"; len: number }> = [];
  for (let i = 0; i < tokens.length;) {
    if (tokens[i] === "M" || tokens[i] === "L") cmd = tokens[i++];
    const x = Number(tokens[i++]);
    const y = Number(tokens[i++]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
    const next = { x, y };
    if (cmd === "L" && current) {
      const dx = Math.abs(next.x - current.x);
      const dy = Math.abs(next.y - current.y);
      if (dx > 0.5 || dy > 0.5) segs.push({ orient: dy < 0.5 ? "h" : dx < 0.5 ? "v" : "diag", len: dx + dy });
    }
    current = next;
  }
  return segs;
}

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

  it("drops an adjacent-lane edge directly from the source's top/bottom face", () => {
    const m = parse(`graph LR
      A[a] --> B[b]
      ---
      nodes:
        A: { zone: client }
        B: { zone: gcp }
    `);
    const layout = computeLayout(m);
    const a = layout.nodes.find((n) => n.id === "A")!;
    const start = layout.edges[0].points[0];
    // client and gcp are adjacent lanes => source exits its top/bottom face.
    const onTopOrBottom = Math.abs(start.y - a.y) < 0.5 || Math.abs(start.y - (a.y + a.h)) < 0.5;
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

describe("label collision avoidance", () => {
  it("leaves no two edge-label boxes overlapping", () => {
    // A graph where several labeled edges converge, stressing label placement.
    const m = parse(`graph LR
      U[User] --> W[Web App]
      U --> A[Android App]
      W -->|HTTPS + JWT| G[API Gateway]
      A -->|HTTPS + JWT| G
      F[Firebase Auth] -->|issues JWT| W
      G -->|HTTPS| R[Cloud Run]
      R -->|SQL| D[(Cloud SQL)]
      ---
      nodes:
        U: { zone: client }
        W: { zone: client }
        A: { zone: client }
        F: { zone: identity }
        G: { zone: gcp }
        R: { zone: gcp }
        D: { zone: gcp }
    `);
    const layout = computeLayout(m);
    const boxes = layout.edges
      .filter((e) => e.label)
      .map((e) => {
        const w = e.label!.length * 6.5 + 8;
        const x0 = e.labelOrient === "v" ? e.labelAt.x - 2 : e.labelAt.x - w / 2;
        return { x0, x1: x0 + w, y0: e.labelAt.y - 9, y1: e.labelAt.y + 9 };
      });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        expect(ox > 0 && oy > 0).toBe(false);
      }
    }
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

  it("does not create a crossing gap beside a corner", () => {
    const edges = [
      { id: "h", points: [{ x: 0, y: 50 }, { x: 80, y: 50 }] },
      { id: "v", points: [{ x: 72, y: 0 }, { x: 72, y: 100 }] },
    ];
    const paths = buildEdgePaths(edges, 7);
    expect(paths.get("h")!.match(/M /g)!.length).toBe(1);
  });

  it("offsets overlapping parallel segments onto separate lanes", () => {
    const edges = [
      { id: "a", points: [{ x: 0, y: 50 }, { x: 120, y: 50 }] },
      { id: "b", points: [{ x: 0, y: 50 }, { x: 120, y: 50 }] },
    ];
    const paths = buildEdgePaths(edges, 7);
    expect(paths.get("a")).not.toBe(paths.get("b"));
    expect(paths.get("a")).toContain("47.0");
    expect(paths.get("b")).toContain("53.0");
  });

  it("keeps offset route corners aligned without interior tick marks", () => {
    const edges = [
      { id: "a", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 120 }] },
      { id: "b", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }] },
    ];
    const paths = buildEdgePaths(edges, 7);
    for (const id of ["a", "b"]) {
      const segs = pathSegments(paths.get(id)!);
      for (let i = 2; i < segs.length - 2; i++) {
        if (segs[i - 1].orient !== segs[i].orient || segs[i].orient !== segs[i + 1].orient) {
          expect(Math.min(segs[i - 1].len, segs[i].len, segs[i + 1].len)).toBeGreaterThan(8);
        }
      }
    }
  });
});
