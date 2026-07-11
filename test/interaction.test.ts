import { describe, expect, it } from "vitest";
import {
  attachLabelPopups,
  attachPanZoom,
  computeFitTransform,
  computePopupAnchorRect,
  isInteractiveTarget,
  shouldStartPanFromPointerTarget,
} from "../src/views/interaction.js";

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

  it("derives popup anchor bounds from SVG children when a group reports a zero rect", () => {
    const trigger = {
      getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
      children: [
        { getBoundingClientRect: () => ({ left: 100, right: 140, top: 50, bottom: 70, width: 40, height: 20 }) },
        { getBoundingClientRect: () => ({ left: 88, right: 132, top: 72, bottom: 92, width: 44, height: 20 }) },
      ],
    } as unknown as Element;

    expect(computePopupAnchorRect(trigger)).toEqual({ left: 88, right: 140, top: 50, bottom: 92, width: 52, height: 42 });
  });

  it("registers popup activation in capture phase before selection-style bubble handlers", () => {
    const registrations: Array<{ type: string; capture: boolean }> = [];
    const removals: Array<{ type: string; capture: boolean }> = [];
    const doc = {
      removeEventListener() {},
    } as unknown as Document;
    const container = {
      ownerDocument: doc,
      addEventListener(type: string, _listener: EventListener, options?: boolean | AddEventListenerOptions) {
        registrations.push({ type, capture: options === true || !!(options as AddEventListenerOptions | undefined)?.capture });
      },
      removeEventListener(type: string, _listener: EventListener, options?: boolean | EventListenerOptions) {
        removals.push({ type, capture: options === true || !!(options as EventListenerOptions | undefined)?.capture });
      },
    } as unknown as HTMLElement;

    const handle = attachLabelPopups(container);

    expect(registrations).toEqual([
      { type: "click", capture: true },
      { type: "keydown", capture: true },
    ]);

    handle.dispose();
    expect(removals).toEqual([
      { type: "click", capture: true },
      { type: "keydown", capture: true },
    ]);
  });

  it("opens a popup from a captured label click and stops competing click handlers", () => {
    class FakeElement {
      attributes = new Map<string, string>();
      children: FakeElement[] = [];
      className = "";
      style: Record<string, string> = {};
      textContent = "";
      offsetWidth = 260;
      offsetHeight = 120;
      removed = false;

      constructor(private rect = { left: 120, right: 200, top: 80, bottom: 104, width: 80, height: 24 }) {}

      getBoundingClientRect() {
        return this.rect;
      }

      getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
      }

      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }

      removeAttribute(name: string) {
        this.attributes.delete(name);
      }

      append(...nodes: FakeElement[]) {
        this.children.push(...nodes);
      }

      remove() {
        this.removed = true;
      }

      contains(target: unknown): boolean {
        return target === this || this.children.some((child) => child.contains(target));
      }

      closest(selector: string) {
        return selector === ".archmap-popup-trigger" && this.className.includes("archmap-popup-trigger") ? this : null;
      }
    }

    const listeners = new Map<string, EventListener>();
    const body = new FakeElement();
    const doc = {
      body,
      documentElement: { clientWidth: 1024, clientHeight: 768 },
      defaultView: { innerWidth: 1024, innerHeight: 768 },
      createElement: () => new FakeElement(),
      addEventListener() {},
      removeEventListener() {},
    } as unknown as Document;
    const container = new FakeElement() as unknown as HTMLElement & FakeElement;
    Object.defineProperty(container, "ownerDocument", { value: doc });
    container.addEventListener = (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    };
    container.removeEventListener = () => {};
    container.contains = () => true;

    const trigger = new FakeElement() as unknown as Element & FakeElement;
    trigger.className = "archmap-popup-trigger";
    trigger.setAttribute("data-archmap-popup-title", "1 warning");
    trigger.setAttribute("data-archmap-popup-detail", "level: warning\ncode: zone_crossing_without_boundary");
    container.children.push(trigger);

    attachLabelPopups(container);

    const eventTarget = {
      closest: () => trigger,
    };
    const event = {
      target: eventTarget,
      preventDefaultCalled: false,
      stopPropagationCalled: false,
      stopImmediatePropagationCalled: false,
      preventDefault() {
        this.preventDefaultCalled = true;
      },
      stopPropagation() {
        this.stopPropagationCalled = true;
      },
      stopImmediatePropagation() {
        this.stopImmediatePropagationCalled = true;
      },
    };

    expect(listeners.get("click")).toBeTypeOf("function");
    listeners.get("click")?.(event as unknown as Event);

    expect(event.preventDefaultCalled).toBe(true);
    expect(event.stopPropagationCalled).toBe(true);
    expect(event.stopImmediatePropagationCalled).toBe(true);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].className).toBe("archmap-label-popup");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("uses ordinary wheel for vertical camera movement and ctrl-wheel for zoom", () => {
    const listeners = new Map<string, EventListener>();
    const svg = {
      style: {},
      viewBox: { baseVal: { width: 1000, height: 500 } },
      clientWidth: 1000,
      clientHeight: 500,
    } as unknown as SVGSVGElement;
    const container = {
      style: {},
      querySelector: () => svg,
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, listener);
      },
      removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    } as unknown as HTMLElement;

    const panZoom = attachPanZoom(container);
    const fitted = panZoom.get();
    listeners.get("wheel")?.({
      preventDefault() {},
      deltaMode: 0,
      deltaX: 0,
      deltaY: 50,
      ctrlKey: false,
      shiftKey: false,
      clientX: 300,
      clientY: 200,
    } as unknown as WheelEvent);
    const scrolled = panZoom.get();

    expect(scrolled.scale).toBe(fitted.scale);
    expect(scrolled.y).toBeCloseTo(fitted.y - 50);

    listeners.get("wheel")?.({
      preventDefault() {},
      deltaMode: 0,
      deltaX: 0,
      deltaY: -60,
      ctrlKey: true,
      shiftKey: false,
      clientX: 300,
      clientY: 200,
    } as unknown as WheelEvent);
    const zoomed = panZoom.get();

    expect(zoomed.scale).toBeGreaterThan(scrolled.scale);
    panZoom.dispose();
  });
});
