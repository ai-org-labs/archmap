/**
 * SVG pan/zoom interaction for 2D views (spec 03 §2.1, 04 controls / TASK-006).
 *
 * The pure `computeFitTransform` is unit-testable; `attachPanZoom` wires wheel
 * zoom (toward the cursor) and drag pan onto the SVG inside a container by
 * setting a CSS transform — it never restructures the DOM, so callers that read
 * `target.innerHTML` keep working.
 */

export interface PanZoomTransform {
  scale: number;
  x: number;
  y: number;
}

export interface PanZoomHandle {
  fit(): void;
  reset(): void;
  get(): PanZoomTransform;
  dispose(): void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

/** Transform that fits `content` centered within `container` (with padding). */
export function computeFitTransform(
  content: { width: number; height: number },
  container: { width: number; height: number },
  padding = 16,
): PanZoomTransform {
  const cw = Math.max(1, container.width - padding * 2);
  const ch = Math.max(1, container.height - padding * 2);
  const w = content.width > 0 ? content.width : 1;
  const h = content.height > 0 ? content.height : 1;
  const scale = clamp(Math.min(cw / w, ch / h), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: (container.width - w * scale) / 2,
    y: (container.height - h * scale) / 2,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A target that supports the DOM bits attachPanZoom needs. */
export function isInteractiveTarget(target: unknown): target is HTMLElement {
  return (
    !!target &&
    typeof (target as HTMLElement).querySelector === "function" &&
    typeof (target as HTMLElement).addEventListener === "function"
  );
}

export function attachPanZoom(container: HTMLElement, initial?: PanZoomTransform): PanZoomHandle {
  const svg = container.querySelector("svg") as SVGSVGElement | null;
  const noop: PanZoomHandle = { fit() {}, reset() {}, get: () => ({ scale: 1, x: 0, y: 0 }), dispose() {} };
  if (!svg) return noop;

  svg.style.transformOrigin = "0 0";
  container.style.overflow = container.style.overflow || "hidden";
  container.style.touchAction = "none";

  let t: PanZoomTransform = initial ? { ...initial } : { scale: 1, x: 0, y: 0 };
  const apply = () => {
    svg.style.transform = `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px) scale(${t.scale})`;
  };

  const contentSize = () => {
    const vb = svg.viewBox.baseVal;
    if (vb && vb.width > 0) return { width: vb.width, height: vb.height };
    return { width: svg.clientWidth || 1, height: svg.clientHeight || 1 };
  };

  const fit = () => {
    const rect = container.getBoundingClientRect();
    t = computeFitTransform(contentSize(), { width: rect.width, height: rect.height });
    apply();
  };
  const reset = () => {
    t = { scale: 1, x: 0, y: 0 };
    apply();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE);
    // Keep the point under the cursor fixed.
    t = { scale, x: px - ((px - t.x) / t.scale) * scale, y: py - ((py - t.y) / t.scale) * scale };
    apply();
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onPointerDown = (e: PointerEvent) => {
    if (e.target instanceof Element && e.target.closest(".archmap-node[data-abstraction-key],.archmap-zone[data-id],.archmap-subgraph[data-id]")) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    container.setPointerCapture?.(e.pointerId);
    container.style.cursor = "grabbing";
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    t = { ...t, x: t.x + (e.clientX - lastX), y: t.y + (e.clientY - lastY) };
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  };
  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    container.releasePointerCapture?.(e.pointerId);
    container.style.cursor = "";
  };

  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointerleave", onPointerUp);

  if (initial) apply();
  else fit();

  return {
    fit,
    reset,
    get: () => ({ ...t }),
    dispose() {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
      svg.style.transform = "";
    },
  };
}
