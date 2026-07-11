/**
 * SVG pan/zoom interaction for 2D views (spec 03 §2.1, 04 controls / TASK-006).
 *
 * The pure `computeFitTransform` is unit-testable; `attachPanZoom` wires
 * pinch/ctrl-wheel zoom (toward the cursor), ordinary wheel vertical camera
 * movement, and drag pan onto the SVG inside a container by setting a CSS
 * transform — it never restructures the DOM, so callers that read
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

export interface LabelPopupHandle {
  dispose(): void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

function wheelUnit(e: WheelEvent, pageSize: number): number {
  if (e.deltaMode === 1) return 16;
  if (e.deltaMode === 2) return Math.max(1, pageSize);
  return 1;
}

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

function isDomNode(value: unknown): value is Node {
  return !!value && typeof (value as Node).nodeType === "number";
}

function parentElementOf(node: Node): Element | null {
  const directParent = (node as Node & { parentElement?: Element | null }).parentElement;
  if (directParent) return directParent;
  const parentNode = node.parentNode;
  return parentNode && parentNode.nodeType === 1 ? parentNode as Element : null;
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (!isDomNode(target)) return null;
  if (target.nodeType === 1) return target as Element;
  return parentElementOf(target);
}

function closestMatchingElement(target: EventTarget | null, selector: string, boundary?: Element): Element | null {
  let current = elementFromEventTarget(target);
  while (current) {
    if (typeof current.matches === "function" && current.matches(selector)) return current;
    if (boundary && current === boundary) return null;
    current = parentElementOf(current);
  }
  return null;
}

function popupRows(detail: string): Array<{ key?: string; value: string }> {
  const trimmed = detail.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      }));
    }
  } catch {
    // Existing overlay payloads are newline-delimited "key: value" pairs.
  }
  return trimmed.split(/\n+/).filter(Boolean).map((line) => {
    const index = line.indexOf(":");
    if (index > 0 && index < 48) {
      return { key: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    }
    return { value: line.trim() };
  });
}

function stylePopup(popup: HTMLElement): void {
  Object.assign(popup.style, {
    position: "fixed",
    zIndex: "2147483647",
    minWidth: "220px",
    maxWidth: "440px",
    maxHeight: "360px",
    overflow: "auto",
    padding: "10px 12px",
    border: "1px solid rgba(91, 107, 134, 0.36)",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.98)",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
    color: "#1f2937",
    font: "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    lineHeight: "1.45",
    pointerEvents: "auto",
  });
}

type PopupRect = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;

export function computePopupAnchorRect(trigger: Element): PopupRect {
  const rect = trigger.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return rect;

  const childRects = Array.from(trigger.children)
    .map((child) => child.getBoundingClientRect())
    .filter((childRect) => childRect.width > 0 || childRect.height > 0);
  if (!childRects.length) return rect;

  const left = Math.min(...childRects.map((childRect) => childRect.left));
  const right = Math.max(...childRects.map((childRect) => childRect.right));
  const top = Math.min(...childRects.map((childRect) => childRect.top));
  const bottom = Math.max(...childRects.map((childRect) => childRect.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function stopPopupActivation(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function positionPopup(popup: HTMLElement, trigger: Element, doc: Document): void {
  const rect = computePopupAnchorRect(trigger);
  const viewportW = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 1024;
  const viewportH = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 768;
  let left = rect.left;
  let top = rect.bottom + 8;
  const margin = 10;
  const w = popup.offsetWidth;
  const h = popup.offsetHeight;
  if (left + w + margin > viewportW) left = Math.max(margin, rect.right - w);
  if (top + h + margin > viewportH) top = Math.max(margin, rect.top - h - 8);
  popup.style.left = `${Math.max(margin, left)}px`;
  popup.style.top = `${Math.max(margin, top)}px`;
}

export function attachLabelPopups(container: HTMLElement): LabelPopupHandle {
  const doc = container.ownerDocument ?? document;
  let popup: HTMLElement | undefined;
  let activeTrigger: Element | undefined;

  const close = () => {
    popup?.remove();
    popup = undefined;
    activeTrigger?.removeAttribute("aria-expanded");
    activeTrigger = undefined;
    doc.removeEventListener("pointerdown", onDocumentPointerDown, true);
    doc.removeEventListener("keydown", onDocumentKeyDown, true);
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && (popup?.contains(target) || activeTrigger?.contains(target))) return;
    close();
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  const open = (trigger: Element) => {
    const title = trigger.getAttribute("data-archmap-popup-title") ?? "Details";
    const detail = trigger.getAttribute("data-archmap-popup-detail") ?? "";
    const rows = popupRows(detail);
    close();
    activeTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");

    const el = doc.createElement("div");
    el.className = "archmap-label-popup";
    el.setAttribute("role", "dialog");
    stylePopup(el);

    const header = doc.createElement("div");
    header.textContent = title;
    Object.assign(header.style, {
      fontWeight: "800",
      marginBottom: rows.length ? "8px" : "0",
      color: "#0f172a",
    });
    el.append(header);

    if (rows.length) {
      const list = doc.createElement("div");
      Object.assign(list.style, {
        display: "grid",
        gridTemplateColumns: "max-content minmax(0, 1fr)",
        gap: "5px 10px",
        whiteSpace: "pre-wrap",
      });
      for (const row of rows) {
        if (row.key) {
          const key = doc.createElement("div");
          key.textContent = row.key;
          Object.assign(key.style, { color: "#64748b", fontWeight: "700" });
          const value = doc.createElement("div");
          value.textContent = row.value;
          Object.assign(value.style, { color: "#1f2937", overflowWrap: "anywhere" });
          list.append(key, value);
        } else {
          const value = doc.createElement("div");
          value.textContent = row.value;
          Object.assign(value.style, {
            gridColumn: "1 / -1",
            color: "#1f2937",
            overflowWrap: "anywhere",
          });
          list.append(value);
        }
      }
      el.append(list);
    }

    doc.body.append(el);
    popup = el;
    positionPopup(el, trigger, doc);
    doc.addEventListener("pointerdown", onDocumentPointerDown, true);
    doc.addEventListener("keydown", onDocumentKeyDown, true);
  };

  const onClick = (event: MouseEvent) => {
    const trigger = closestMatchingElement(event.target, ".archmap-popup-trigger", container);
    if (!trigger) return;
    stopPopupActivation(event);
    if (trigger === activeTrigger && popup) close();
    else open(trigger);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const trigger = closestMatchingElement(event.target, ".archmap-popup-trigger", container);
    if (!trigger) return;
    stopPopupActivation(event);
    if (trigger === activeTrigger && popup) close();
    else open(trigger);
  };

  container.addEventListener("click", onClick, true);
  container.addEventListener("keydown", onKeyDown, true);

  return {
    dispose() {
      close();
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("keydown", onKeyDown, true);
    },
  };
}

function hasClass(target: unknown, className: string): boolean {
  return typeof (target as Element | undefined)?.classList?.contains === "function" &&
    (target as Element).classList.contains(className);
}

export function shouldStartPanFromPointerTarget(target: EventTarget | null, container: HTMLElement, svg: SVGSVGElement): boolean {
  if (closestMatchingElement(target, ".archmap-popup-trigger", container)) return false;
  const expansionTarget = closestMatchingElement(
    target,
    ".archmap-node[data-abstraction-key],.archmap-zone[data-id],.archmap-subgraph[data-id]",
    container,
  );
  if (!expansionTarget) return true;
  return hasClass(container, "archmap-abstraction-locked") || hasClass(svg, "archmap-abstraction-locked");
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

  const zoomAt = (factor: number, px: number, py: number) => {
    const scale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE);
    t = { scale, x: px - ((px - t.x) / t.scale) * scale, y: py - ((py - t.y) / t.scale) * scale };
    apply();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const unit = wheelUnit(e, rect.height);
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey) {
      zoomAt(Math.exp(-dy * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    const xDelta = e.shiftKey && Math.abs(dx) < Math.abs(dy) ? dy : dx;
    t = { ...t, x: t.x - xDelta, y: t.y - dy };
    apply();
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onPointerDown = (e: PointerEvent) => {
    if (!shouldStartPanFromPointerTarget(e.target, container, svg)) return;
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
