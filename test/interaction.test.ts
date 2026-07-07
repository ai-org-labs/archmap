import { describe, expect, it } from "vitest";
import { attachPanZoom, computeFitTransform, isInteractiveTarget, shouldStartPanFromPointerTarget } from "../src/views/interaction.js";

describe("computeFitTransform (TASK-006)", () => {
  it("scales content to fit the container with padding and centers it", () => {
    const t = computeFitTransform({ width: 1000, height: 500 }, { width: 600, height: 400 }, 16);
    // fits the wider dimension: (600-32)/1000 = 0.568 vs (400-32)/500 = 0.736 -> min
    expect(t.scale).toBeCloseTo(0.568, 3);
    // centered horizontally and vertically
    expect(t.x).toBeCloseTo((600 - 1000 * t.scale) / 2, 3);
    expect(t.y).toBeCloseTo((400 - 500 * t.scale) / 2, 3);
  });

  it("clamps scale within bounds and handles zero content", () => {
    const big = computeFitTransform({ width: 1, height: 1 }, { width: 4000, height: 4000 });
    expect(big.scale).toBeLessThanOrEqual(8);
    const zero = computeFitTransform({ width: 0, height: 0 }, { width: 100, height: 100 });
    expect(zero.scale).toBeGreaterThan(0);
  });

  it("detects interactive DOM-like targets", () => {
    expect(isInteractiveTarget({ querySelector() {}, addEventListener() {} })).toBe(true);
    expect(isInteractiveTarget({ innerHTML: "" })).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });

  it("allows zone-area pan starts only while abstraction interaction is locked", () => {
    const classSet = new Set<string>();
    const container = {
      classList: { contains: (name: string) => classSet.has(name) },
    } as unknown as HTMLElement;
    const svg = {
      classList: { contains: (name: string) => classSet.has(name) },
    } as unknown as SVGSVGElement;
    const zoneTarget = {
      closest: (selector: string) => selector.includes(".archmap-zone") ? {} : null,
    } as unknown as EventTarget;

    expect(shouldStartPanFromPointerTarget(zoneTarget, container, svg)).toBe(false);

    classSet.add("archmap-abstraction-locked");
    expect(shouldStartPanFromPointerTarget(zoneTarget, container, svg)).toBe(true);
  });

  it("keeps an existing transform when reattached with an initial value", () => {
    const svg = {
      style: {},
      viewBox: { baseVal: { width: 1000, height: 500 } },
      clientWidth: 1000,
      clientHeight: 500,
    } as unknown as SVGSVGElement;
    const container = {
      style: {},
      querySelector: () => svg,
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect: () => ({ width: 600, height: 400 }),
    } as unknown as HTMLElement;

    const panZoom = attachPanZoom(container, { scale: 1.75, x: -120, y: 42 });

    expect(panZoom.get()).toEqual({ scale: 1.75, x: -120, y: 42 });
    expect(svg.style.transform).toBe("translate(-120.00px, 42.00px) scale(1.75)");
    panZoom.dispose();
  });
});
