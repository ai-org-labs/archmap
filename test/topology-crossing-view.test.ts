import { describe, expect, it } from "vitest";
import { buildCrossingVisuals, type CrossingRect } from "../src/topology-crossing-view.js";
import type { ContainerBoundary, Crossing } from "../src/topology.js";

const containers: ContainerBoundary[] = [
  { id: "left-vpc", label: "Left VPC", kind: "vpc", roles: ["network"], parent: null },
  { id: "right-vpc", label: "Right VPC", kind: "vpc", roles: ["network"], parent: null },
];

const crossings: Crossing[] = [
  {
    id: "api-db:forward:0",
    edgeId: "api-db",
    traversal: "forward",
    sequence: 0,
    boundaryId: "left-vpc",
    direction: "exit",
    roles: ["network"],
  },
  {
    id: "api-db:forward:1",
    edgeId: "api-db",
    traversal: "forward",
    sequence: 1,
    boundaryId: "right-vpc",
    direction: "enter",
    roles: ["network"],
  },
];

function overlaps(a: CrossingRect, b: CrossingRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("crossing-focused topology visualization", () => {
  it("anchors visible crossings at actual routed boundary intersections", () => {
    const visuals = buildCrossingVisuals({
      crossings,
      containers,
      visibleContainerIds: new Set(["left-vpc", "right-vpc"]),
      containerBoxes: new Map([
        ["left-vpc", { id: "left-vpc", x: 0, y: 0, w: 100, h: 100 }],
        ["right-vpc", { id: "right-vpc", x: 200, y: 0, w: 100, h: 100 }],
      ]),
      edgePoints: new Map([["api-db", [{ x: 50, y: 50 }, { x: 250, y: 50 }]]]),
    });

    expect(visuals.map(({ boundaryId, direction, point, visibleBoundary }) => ({ boundaryId, direction, point, visibleBoundary }))).toEqual([
      { boundaryId: "left-vpc", direction: "exit", point: { x: 100, y: 50 }, visibleBoundary: true },
      { boundaryId: "right-vpc", direction: "enter", point: { x: 200, y: 50 }, visibleBoundary: true },
    ]);
  });

  it("keeps hidden-boundary markers on the final route and separates their labels", () => {
    const blocker = { id: "node", x: 48, y: 6, w: 104, h: 24 };
    const visuals = buildCrossingVisuals({
      crossings,
      containers,
      visibleContainerIds: new Set(),
      containerBoxes: new Map(),
      edgePoints: new Map([["api-db", [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }]]]),
      blockers: [blocker],
    });

    expect(visuals).toHaveLength(2);
    expect(visuals.every(({ visibleBoundary }) => !visibleBoundary)).toBe(true);
    expect(visuals[0].point).toEqual({ x: 100, y: 0 });
    expect(visuals[1].point).toEqual({ x: 200, y: 0 });
    expect(overlaps(visuals[0].labelBox, blocker)).toBe(false);
    expect(overlaps(visuals[0].labelBox, visuals[1].labelBox)).toBe(false);
    expect(visuals.every(({ point, labelBox }) => !(
      point.x > labelBox.x && point.x < labelBox.x + labelBox.w
      && point.y > labelBox.y && point.y < labelBox.y + labelBox.h
    ))).toBe(true);
  });
});
