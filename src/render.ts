/**
 * Render layer: view registry + the `render` / `initialize` API (§27).
 *
 * A view is a pure function from (model, layout) to an SVG string. This keeps
 * views testable headlessly and lets a future three.js view register the same
 * way and consume the same LayoutResult (with `z`).
 */

import { computeLayout } from "./layout.js";
import type { LayoutOptions, LayoutResult } from "./layout.js";
import { diagnostic, syncDiagnostics, reportDiagnosticsToConsole } from "./diagnostics.js";
import type { ConsoleReportOptions } from "./diagnostics.js";
import { parse } from "./parser-entry.js";
import { extractArchMapBlocks } from "./parser/sections.js";
import type { ArchMapModel, Direction } from "./types.js";
import { resolveNodeIcons } from "./icons.js";
import { overviewView, layerBoxes, layerView } from "./views/overview.js";
import { zoneView } from "./views/zone.js";
import { authView } from "./views/auth.js";
import { dataflowView } from "./views/dataflow.js";
import { boundaryView } from "./views/boundary.js";
import { validationView } from "./views/validation.js";
import { renderDiagram } from "./views/base.js";
import { escapeXml } from "./views/svg.js";
import { buildOverlayProjection, OVERLAY_NAMES } from "./views/overlays.js";
import { attachPanZoom, isInteractiveTarget } from "./views/interaction.js";
import type { PanZoomHandle } from "./views/interaction.js";
import { renderInspector } from "./inspector.js";
import type { InspectorSelection } from "./inspector.js";

export interface ViewContext {
  model: ArchMapModel;
  layout: LayoutResult;
  options: RenderOptions;
}

/** Handle returned by an imperative (mounted) view, e.g. the WebGL 3D view. */
export interface ViewHandle {
  dispose(): void;
}

/** A view that mounts imperatively into a DOM element instead of returning SVG. */
export interface MountableView {
  mount(target: Element): ViewHandle;
}

/**
 * A view renders either to an SVG string (the 2D views) or to a mountable
 * object (the WebGL 3D view). The latter owns a canvas and an animation loop.
 */
export type ViewRenderer = (ctx: ViewContext) => string | MountableView;

export interface RenderOptions {
  /** What semantic structure to inspect: overview, zone, or layer. */
  baseView?: string;
  /** How to display the selected semantic view. */
  renderMode?: "2d" | "isometric" | "3d" | string;
  /** Additive information layers rendered on top of the selected base view. */
  overlays?: string[];
  /** Legacy flat view selector. Kept for compatibility with existing callers. */
  view?: string;
  direction?: Direction;
  rankBy?: LayoutOptions["rankBy"];
  /** DOM element to inject the SVG into (browser only). */
  target?: Element | null;
  /** DOM element or selector to receive diagnostics after render. */
  diagnosticsTarget?: Element | string | null;
  /** DOM element or selector to receive selected-element inspector output. */
  inspectorTarget?: Element | string | null;
  /** Initial inspector selection. */
  selection?: InspectorSelection | null;
  /** Report diagnostics to the console (spec 02 §23). Default: off for the
   * programmatic API; engines (viewer/initialize) default it on. */
  console?: boolean | ConsoleReportOptions;
  /** Enable SVG pan/zoom on the target for 2D views (default on with a DOM target). */
  interactive?: boolean;
}

export interface RenderResult {
  view: string;
  layout: LayoutResult;
  model: ArchMapModel;
  /** Present for SVG (2D) views. */
  svg?: string;
  /** Present for mounted (3D) views when a target was supplied. */
  handle?: ViewHandle;
  setBaseView(view: string): void;
  setRenderMode(mode: string): void;
  setOverlays(overlays: string[]): void;
  addOverlay(overlay: string): void;
  removeOverlay(overlay: string): void;
  toggleOverlay(overlay: string): void;
  fit(): void;
  reset(): void;
  destroy(): void;
}

const registry = new Map<string, ViewRenderer>();

export function registerView(name: string, renderer: ViewRenderer): void {
  registry.set(name, renderer);
}

export function getView(name: string): ViewRenderer | undefined {
  return registry.get(name);
}

export function listViews(): string[] {
  return [...registry.keys()];
}

function diagnosticLabel(model: ArchMapModel): string {
  return `Errors ${model.errors.length} / Warnings ${model.warnings.length} / Suggestions ${model.suggestions.length} / Infos ${model.infos.length}`;
}

function diagnosticTarget(target: Element | string | null | undefined): Element | undefined {
  if (!target) return undefined;
  if (typeof target !== "string") return target;
  return typeof document !== "undefined" ? document.querySelector(target) ?? undefined : undefined;
}

function selectableKind(el: Element): InspectorSelection["type"] | undefined {
  if (el.classList.contains("archmap-node")) return "node";
  if (el.classList.contains("archmap-edge")) return "edge";
  if (el.classList.contains("archmap-zone")) return "zone";
  if (el.classList.contains("archmap-boundary")) return "boundary";
  if (el.classList.contains("archmap-permission-edge")) return "permission";
  return undefined;
}

function resolvedSelection(model: ArchMapModel, selection: InspectorSelection | null | undefined): InspectorSelection | undefined {
  if (!selection) return undefined;
  if (selection.type !== "diagnostic") return selection;
  const diagnostic = model.diagnostics[Number(selection.id)] ?? model.diagnostics.find((entry) => entry.code === selection.id);
  const target = diagnostic?.target ?? (diagnostic?.ref ? { type: diagnostic.ref.kind, id: diagnostic.ref.id } : undefined);
  if (!target || target.type === "view") return selection;
  return { type: target.type as InspectorSelection["type"], id: target.id };
}

function selectedSelector(selection: InspectorSelection): string | undefined {
  if (selection.type === "diagnostic") return undefined;
  const encoded = escapeXml(selection.id);
  if (selection.type === "node") return `(<g class=")(archmap-node[^"]*)(" data-id="${encoded}")`;
  if (selection.type === "edge") return `(<g class=")(archmap-edge[^"]*)(" data-id="${encoded}")`;
  if (selection.type === "zone") return `(<g class=")(archmap-zone[^"]*)(" data-id="${encoded}")`;
  if (selection.type === "boundary") return `(<g class=")(archmap-boundary[^"]*)(" data-id="${encoded}")`;
  if (selection.type === "permission") return `(<g class=")(archmap-overlay-edge archmap-permission-edge[^"]*)(" data-id="permission:${encoded}:[^"]*")`;
  return undefined;
}

function decorateSvgWithSelection(svg: string, model: ArchMapModel, selection: InspectorSelection | null | undefined): string {
  const resolved = resolvedSelection(model, selection);
  if (!resolved) return svg;
  const pattern = selectedSelector(resolved);
  if (!pattern) return svg;
  return svg.replace(new RegExp(pattern), (_match, prefix: string, classes: string, suffix: string) => {
    if (classes.includes("archmap-selected")) return `${prefix}${classes}${suffix}`;
    return `${prefix}${classes} archmap-selected${suffix}`;
  });
}

function clearSelected(target: Element): void {
  target.querySelectorAll?.(".archmap-selected").forEach((el) => el.classList.remove("archmap-selected"));
}

function markSelectedElement(target: Element, selection: InspectorSelection): void {
  clearSelected(target);
  if (selection.type === "diagnostic") return;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selection.id) : selection.id.replace(/["\\]/g, "\\$&");
  const selectors: Partial<Record<InspectorSelection["type"], string>> = {
    node: `.archmap-node[data-id="${escaped}"]`,
    edge: `.archmap-edge[data-id="${escaped}"]`,
    zone: `.archmap-zone[data-id="${escaped}"]`,
    boundary: `.archmap-boundary[data-id="${escaped}"]`,
    permission: `.archmap-permission-edge[data-id^="permission:${escaped}:"]`,
  };
  const selector = selectors[selection.type];
  if (!selector) return;
  target.querySelector?.(selector)?.classList.add("archmap-selected");
}

function attachInspectorSelection(target: Element, model: ArchMapModel, inspectorTarget: Element | string | null | undefined): () => void {
  const elementFor = (selection: InspectorSelection): unknown => {
    switch (selection.type) {
      case "node": return model.nodes.find((entry) => entry.id === selection.id);
      case "edge": return model.edges.find((entry) => entry.id === selection.id);
      case "zone": return model.zones.find((entry) => entry.id === selection.id);
      case "boundary": return model.boundaries.find((entry) => entry.id === selection.id);
      case "permission": return model.permissions.find((entry) => entry.id === selection.id);
      case "identity": return model.identities.find((entry) => entry.id === selection.id);
      case "data": return model.data.find((entry) => entry.id === selection.id);
      case "diagnostic": return model.diagnostics[Number(selection.id)] ?? model.diagnostics.find((entry) => entry.code === selection.id);
    }
  };
  const handler = (event: Event) => {
    const source = event.target instanceof Element
      ? event.target.closest(".archmap-node,.archmap-edge,.archmap-zone,.archmap-boundary,.archmap-permission-edge")
      : null;
    if (!source) return;
    const type = selectableKind(source);
    const rawId = source.getAttribute("data-id");
    if (!type || !rawId) return;
    const id = type === "permission" ? rawId.split(":")[1] ?? rawId : rawId;
    const selection: InspectorSelection = { type, id };
    markSelectedElement(target, selection);
    renderInspector(model, selection, inspectorTarget);
    target.dispatchEvent(new CustomEvent(`archmap:select-${type}`, { detail: { selection, [type]: elementFor(selection) }, bubbles: true }));
  };
  target.addEventListener("click", handler);
  return () => target.removeEventListener("click", handler);
}

function attachDiagnosticSelection(
  diagramTarget: Element,
  model: ArchMapModel,
  diagnosticsTarget: Element | string | null | undefined,
  inspectorTarget: Element | string | null | undefined,
): (() => void) | undefined {
  const diagnosticsEl = diagnosticTarget(diagnosticsTarget);
  if (!diagnosticsEl) return undefined;
  const handler = (event: Event) => {
    const source = event.target instanceof Element ? event.target.closest("[data-diagnostic-index]") : null;
    const index = source?.getAttribute("data-diagnostic-index");
    if (index === null || index === undefined) return;
    const diagnosticSelection: InspectorSelection = { type: "diagnostic", id: index };
    const targetSelection = resolvedSelection(model, diagnosticSelection);
    if (targetSelection) markSelectedElement(diagramTarget, targetSelection);
    renderInspector(model, diagnosticSelection, inspectorTarget);
    diagramTarget.dispatchEvent(new CustomEvent("archmap:select-diagnostic", {
      detail: { selection: diagnosticSelection, diagnostic: model.diagnostics[Number(index)] },
      bubbles: true,
    }));
  };
  diagnosticsEl.addEventListener("click", handler);
  return () => diagnosticsEl.removeEventListener("click", handler);
}

export function diagnosticsHtml(model: ArchMapModel): string {
  syncDiagnostics(model);
  const items = model.diagnostics
    .map((d, index) => {
      const target = d.target ? ` ${d.target.type}:${d.target.id}` : "";
      const targetAttrs = d.target
        ? ` data-target-type="${escapeXml(d.target.type)}" data-target-id="${escapeXml(d.target.id)}"`
        : "";
      return `<li class="archmap-diagnostic archmap-diagnostic-${escapeXml(d.level ?? d.severity)}">` +
        `<button type="button" data-diagnostic-index="${index}"${targetAttrs}>` +
        `<strong>${escapeXml(d.code)}</strong>${escapeXml(target)}: ${escapeXml(d.message)}` +
        `</button>` +
        `</li>`;
    })
    .join("");
  return (
    `<div class="archmap-diagnostics" role="status">` +
    `<div class="archmap-diagnostics-summary">${escapeXml(diagnosticLabel(model))}</div>` +
    `<ul>${items}</ul>` +
    `</div>`
  );
}

export function renderDiagnostics(model: ArchMapModel, target: Element | string | null | undefined): string {
  const html = diagnosticsHtml(model);
  const el = diagnosticTarget(target);
  if (el && "innerHTML" in el) el.innerHTML = html;
  return html;
}

// Built-in views.
registerView("overview", overviewView);
registerView("zone", zoneView);
registerView("layer", layerView);
registerView("auth", authView);
registerView("dataflow", dataflowView);
registerView("boundary", boundaryView);
registerView("validation", validationView);
registerView("3d", ({ model }) => {
  model.warnings.push(diagnostic("view_3d_unavailable", "3D renderer is not installed. Import archmap/views3d/three-view and call installThreeView() to enable it.", { type: "view", id: "3d" }));
  return (
    `<svg class="archmap archmap-view-3d archmap-view-unavailable" viewBox="0 0 640 220" width="640" height="220" xmlns="http://www.w3.org/2000/svg">` +
    `<style>.archmap-view-unavailable text{font:500 14px system-ui,sans-serif;fill:#3a4a63}.archmap-view-unavailable rect{fill:#fff7ed;stroke:#c85a46;stroke-width:1.5}</style>` +
    `<rect x="16" y="16" width="608" height="188" rx="8" ry="8" />` +
    `<text x="40" y="86">${escapeXml("3D view is not installed in the core bundle.")}</text>` +
    `<text x="40" y="116">${escapeXml("Import archmap/views3d/three-view and call installThreeView().")}</text>` +
    `</svg>`
  );
});

/**
 * A view's preferred flow-axis ranking, unless the caller overrides it.
 * The zone view intentionally uses the default topological ranking: zone
 * grouping already comes from the swimlanes (cross axis), so ranking the flow
 * axis by zone too would collapse both axes onto zone and route edges across
 * nodes. It just emphasizes cross-zone edges on the normal layout.
 */
const VIEW_RANK_BY: Record<string, LayoutOptions["rankBy"]> = {
  layer: "topo",
};

const VIEW_LANE_BY: Record<string, LayoutOptions["laneBy"]> = {
  layer: "layer",
};

function validateOverlays(model: ArchMapModel, overlays: string[]): void {
  for (const overlay of overlays) {
    if (OVERLAY_NAMES.has(overlay)) continue;
    model.warnings.push(diagnostic("unknown_overlay", `Unknown overlay "${overlay}". Known overlays: ${[...OVERLAY_NAMES].join(", ")}.`, { type: "view", id: overlay }));
  }
}

function decorateSvgWithOverlays(svg: string, overlays: string[]): string {
  if (overlays.length === 0) return svg;
  const suffix = overlays.map((overlay) => overlay.replace(/[^a-z0-9_-]/gi, "-")).join(" ");
  const classes = overlays.map((overlay) => `archmap-overlay-${overlay.replace(/[^a-z0-9_-]/gi, "-")}`).join(" ");
  return svg.replace(
    /^<svg\b([^>]*)>/,
    (_match, attrs: string) => {
      const withClasses = attrs.includes('class="')
        ? attrs.replace(/class="([^"]*)"/, `class="$1 ${classes}"`)
        : `${attrs} class="${classes}"`;
      return `<svg${withClasses} data-overlays="${suffix}">`;
    },
  );
}

function metadataBaseView(model: ArchMapModel): string | undefined {
  const value = model.view?.default;
  if (typeof value === "string") return value;
  return value?.base;
}

function metadataOverlays(model: ArchMapModel): string[] {
  const value = model.view?.default;
  return typeof value === "object" ? value.overlays ?? [] : [];
}

function renderBaseViewWithOverlays(model: ArchMapModel, layout: LayoutResult, view: string, overlays: string[]): string | undefined {
  if (overlays.length === 0 || (view !== "overview" && view !== "zone" && view !== "layer")) return undefined;
  const projection = buildOverlayProjection(model, layout, overlays);
  const baseEdges = new Set<string>();
  if (view === "zone") {
    const zoneOf = new Map(model.nodes.map((n) => [n.id, n.resolvedZone === "unknown" ? undefined : n.resolvedZone ?? n.zone]));
    for (const edge of layout.edges) {
      const a = zoneOf.get(edge.from);
      const b = zoneOf.get(edge.to);
      if (a !== undefined && b !== undefined && a !== b) baseEdges.add(edge.id);
    }
  }
  const emphasizeEdges = projection.emphasizeEdges || baseEdges.size
    ? new Set([...(projection.emphasizeEdges ?? []), ...baseEdges])
    : undefined;
  const baseBoxGroups = view === "layer"
    ? [{ boxes: layerBoxes({ model, layout, options: { baseView: view, overlays } }), boxClass: "archmap-layer" }]
    : view === "zone"
      ? [{ boxes: layout.zones, boxClass: "archmap-zone" }]
      : [];
  return renderDiagram({
    layout,
    viewClass: view,
    boxGroups: [
      ...baseBoxGroups,
      ...(projection.boxGroups ?? []),
    ],
    emphasizeNodes: projection.emphasizeNodes,
    emphasizeEdges,
    nodeBadges: projection.nodeBadges,
    overlayEdges: projection.overlayEdges,
    nodeIcons: resolveNodeIcons(model),
  });
}

/** Render a model into an SVG string, optionally injecting it into a target. */
export function render(model: ArchMapModel, options: RenderOptions = {}): RenderResult {
  const requestedView = options.baseView ?? options.view ?? metadataBaseView(model) ?? "overview";
  const renderMode = options.renderMode ?? "2d";
  const state = {
    view: renderMode === "3d" || renderMode === "isometric" ? "3d" : requestedView,
    requestedView,
    renderMode,
    overlays: [...(options.overlays ?? metadataOverlays(model))],
  };
  let panZoom: PanZoomHandle | undefined;
  let detachInspector: (() => void) | undefined;
  let detachDiagnostics: (() => void) | undefined;

  const snapshot = (): Pick<RenderResult, "view" | "layout" | "model" | "svg" | "handle"> => {
    validateOverlays(model, state.overlays);
    const renderer = registry.get(state.view);
    if (!renderer) {
      model.warnings.push(diagnostic("unknown_base_view", `Unknown view "${state.view}". Registered views: ${listViews().join(", ") || "(none)"}.`, { type: "view", id: state.view }));
      syncDiagnostics(model);
      throw new Error(`Unknown view "${state.view}". Registered views: ${listViews().join(", ") || "(none)"}.`);
    }
    const rankBy = options.rankBy ?? VIEW_RANK_BY[state.requestedView] ?? VIEW_RANK_BY[state.view];
    const laneBy = VIEW_LANE_BY[state.requestedView] ?? VIEW_LANE_BY[state.view];
    const layout = computeLayout(model, { direction: options.direction, rankBy, laneBy });
    const knownOverlays = state.overlays.filter((overlay) => OVERLAY_NAMES.has(overlay));
    const overlaidSvg = renderBaseViewWithOverlays(model, layout, state.view, knownOverlays);
    const out = overlaidSvg ?? renderer({ model, layout, options: { ...options, baseView: state.requestedView, renderMode: state.renderMode, overlays: state.overlays } });

    if (typeof out === "string") {
      const svg = decorateSvgWithSelection(decorateSvgWithOverlays(out, knownOverlays), model, options.selection);
      syncDiagnostics(model);
      renderDiagnostics(model, options.diagnosticsTarget);
      renderInspector(model, options.selection ?? null, options.inspectorTarget);
      if (options.console !== undefined) reportDiagnosticsToConsole(model, options.console);
      if (options.target && "innerHTML" in options.target) {
        options.target.innerHTML = svg;
        panZoom?.dispose();
        panZoom = undefined;
        detachInspector?.();
        detachInspector = undefined;
        detachDiagnostics?.();
        detachDiagnostics = undefined;
        if (options.interactive !== false && isInteractiveTarget(options.target)) {
          panZoom = attachPanZoom(options.target);
        }
        if (options.inspectorTarget && "addEventListener" in options.target && "dispatchEvent" in options.target) {
          detachInspector = attachInspectorSelection(options.target, model, options.inspectorTarget);
        }
        if (options.diagnosticsTarget && "addEventListener" in options.target && "dispatchEvent" in options.target) {
          detachDiagnostics = attachDiagnosticSelection(options.target, model, options.diagnosticsTarget, options.inspectorTarget);
        }
      }
      return { view: state.view, layout, model, svg, handle: undefined };
    }
    const handle = options.target ? out.mount(options.target) : undefined;
    syncDiagnostics(model);
    renderDiagnostics(model, options.diagnosticsTarget);
    renderInspector(model, options.selection ?? null, options.inspectorTarget);
    if (options.console !== undefined) reportDiagnosticsToConsole(model, options.console);
    return { view: state.view, layout, model, handle, svg: undefined };
  };

  const result: RenderResult = {
    view: state.view,
    layout: computeLayout(model, {
      direction: options.direction,
      rankBy: options.rankBy ?? VIEW_RANK_BY[state.requestedView] ?? VIEW_RANK_BY[state.view],
      laneBy: VIEW_LANE_BY[state.requestedView] ?? VIEW_LANE_BY[state.view],
    }),
    model,
    svg: undefined,
    handle: undefined,
    setBaseView(view: string) {
      state.requestedView = view;
      state.view = state.renderMode === "3d" || state.renderMode === "isometric" ? "3d" : view;
      apply(snapshot());
    },
    setRenderMode(mode: string) {
      state.renderMode = mode;
      state.view = mode === "3d" || mode === "isometric" ? "3d" : state.requestedView;
      apply(snapshot());
    },
    setOverlays(overlays: string[]) {
      state.overlays = [...overlays];
      apply(snapshot());
    },
    addOverlay(overlay: string) {
      if (!state.overlays.includes(overlay)) state.overlays = [...state.overlays, overlay];
      apply(snapshot());
    },
    removeOverlay(overlay: string) {
      state.overlays = state.overlays.filter((entry) => entry !== overlay);
      apply(snapshot());
    },
    toggleOverlay(overlay: string) {
      state.overlays = state.overlays.includes(overlay)
        ? state.overlays.filter((entry) => entry !== overlay)
        : [...state.overlays, overlay];
      apply(snapshot());
    },
    fit() {
      panZoom?.fit();
    },
    reset() {
      panZoom?.reset();
    },
    destroy() {
      panZoom?.dispose();
      panZoom = undefined;
      detachInspector?.();
      detachInspector = undefined;
      detachDiagnostics?.();
      detachDiagnostics = undefined;
      result.handle?.dispose();
      result.handle = undefined;
      result.svg = undefined;
      if (options.target && "innerHTML" in options.target) {
        options.target.innerHTML = "";
      }
    },
  };

  const apply = (next: Pick<RenderResult, "view" | "layout" | "model" | "svg" | "handle">): void => {
    result.handle?.dispose();
    result.view = next.view;
    result.layout = next.layout;
    result.svg = next.svg;
    result.handle = next.handle;
  };

  apply(snapshot());
  return result;
}

export interface InitializeOptions {
  startOnLoad?: boolean;
  defaultView?: string;
  /** CSS selector for elements whose text content is ArchMap source. */
  selector?: string;
  /** Define the <archmap-viewer> custom element when available. */
  defineCustomElement?: boolean;
}

export interface ViewerAttributeOptions {
  baseView?: string;
  renderMode: string;
  overlays: string[];
  width: string;
  height: string;
  src?: string;
  diagnostics: boolean;
  diagnosticsTarget?: string;
  inspector: boolean;
  inspectorTarget?: string;
  fallbackToInline: boolean;
  /** Console diagnostics reporting; default on for the viewer (spec 02 §23). */
  consoleReport: boolean;
  /** Show the controls toolbar (view selector, render mode, additive overlays, fit/reset). */
  controls: boolean;
}

export function parseOverlaysAttribute(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function viewerOptionsFromAttributes(attrs: Pick<Element, "getAttribute"> & Partial<Pick<Element, "hasAttribute">>): ViewerAttributeOptions {
  return {
    baseView: attrs.getAttribute("base-view") ?? undefined,
    renderMode: attrs.getAttribute("render-mode") ?? "2d",
    overlays: parseOverlaysAttribute(attrs.getAttribute("overlays")),
    width: attrs.getAttribute("width") ?? "100%",
    height: attrs.getAttribute("height") ?? "600px",
    src: attrs.getAttribute("src") ?? undefined,
    diagnostics: attrs.getAttribute("diagnostics") === "true" || attrs.hasAttribute?.("diagnostics") === true,
    diagnosticsTarget: attrs.getAttribute("diagnostics-target") ?? undefined,
    inspector: attrs.getAttribute("inspector") === "true" || attrs.hasAttribute?.("inspector") === true,
    inspectorTarget: attrs.getAttribute("inspector-target") ?? undefined,
    fallbackToInline: attrs.hasAttribute?.("fallback-to-inline") === true,
    consoleReport: attrs.getAttribute("console") !== "false",
    controls: attrs.getAttribute("controls") === "true" || attrs.hasAttribute?.("controls") === true,
  };
}

/** Semantic views offered by the controls toolbar: what the user wants to inspect. */
export const BASE_VIEWS = ["overview", "layer"] as const;
/** Render modes offered by the controls toolbar: how to display the selected view. */
export const RENDER_MODES = ["2d", "3d"] as const;

export async function fetchArchMapSource(src: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(src);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** Define the long-term <archmap-viewer> embedding element when running in a browser. */
export function defineArchMapViewerElement(): void {
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined") return;
  if (customElements.get("archmap-viewer")) return;

  class ArchMapViewerElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return ["base-view", "render-mode", "overlays", "width", "height", "src", "diagnostics", "diagnostics-target", "inspector", "inspector-target", "fallback-to-inline", "console", "controls"];
    }

    private source = "";
    private container?: HTMLDivElement;
    private diagnosticsPanel?: HTMLDivElement;
    private inspectorPanel?: HTMLDivElement;
    private controlsBar?: HTMLDivElement;
    private result?: RenderResult;
    private loadVersion = 0;

    connectedCallback(): void {
      if (!this.source) this.source = this.textContent ?? "";
      void this.renderSource();
    }

    disconnectedCallback(): void {
      this.result?.destroy();
      this.result = undefined;
    }

    attributeChangedCallback(name: string): void {
      if (!this.isConnected) return;
      if (!this.result) {
        void this.renderSource();
        return;
      }
      const options = viewerOptionsFromAttributes(this);
      if (name === "base-view" && options.baseView) {
        this.result.setBaseView(options.baseView);
      } else if (name === "render-mode") {
        this.result.setRenderMode(options.renderMode);
      } else if (name === "overlays") {
        this.result.setOverlays(options.overlays);
      } else if (name === "width" || name === "height") {
        this.applyFrameStyle();
      } else {
        void this.renderSource();
      }
    }

    private ensureContainer(): HTMLDivElement {
      if (this.container) return this.container;
      this.innerHTML = "";
      const container = document.createElement("div");
      container.className = "archmap-viewer-frame";
      this.appendChild(container);
      this.container = container;
      return container;
    }

    private ensureDiagnosticsPanel(): HTMLDivElement {
      if (this.diagnosticsPanel) return this.diagnosticsPanel;
      const panel = document.createElement("div");
      panel.className = "archmap-viewer-diagnostics";
      this.appendChild(panel);
      this.diagnosticsPanel = panel;
      return panel;
    }

    private ensureInspectorPanel(): HTMLDivElement {
      if (this.inspectorPanel) return this.inspectorPanel;
      const panel = document.createElement("div");
      panel.className = "archmap-viewer-inspector";
      this.appendChild(panel);
      this.inspectorPanel = panel;
      return panel;
    }

    private applyFrameStyle(): void {
      const options = viewerOptionsFromAttributes(this);
      this.style.display = this.style.display || "block";
      this.style.width = options.width;
      this.style.height = options.height;
      const container = this.ensureContainer();
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.overflow = "auto";
    }

    private diagnosticsTarget(options: ViewerAttributeOptions): Element | undefined {
      if (options.diagnosticsTarget) return document.querySelector(options.diagnosticsTarget) ?? undefined;
      return options.diagnostics ? this.ensureDiagnosticsPanel() : undefined;
    }

    private inspectorTarget(options: ViewerAttributeOptions): Element | undefined {
      if (options.inspectorTarget) return document.querySelector(options.inspectorTarget) ?? undefined;
      return options.inspector ? this.ensureInspectorPanel() : undefined;
    }

    private renderModel(model: ArchMapModel, options: ViewerAttributeOptions): void {
      this.applyFrameStyle();
      this.result?.destroy();
      this.result = render(model, {
        baseView: options.baseView,
        renderMode: options.renderMode,
        overlays: options.overlays,
        target: this.ensureContainer(),
        diagnosticsTarget: this.diagnosticsTarget(options),
        inspectorTarget: this.inspectorTarget(options),
        console: options.consoleReport,
      });
      if (options.controls) this.renderControls(options);
      else this.controlsBar?.remove(), (this.controlsBar = undefined);
    }

    /** Controls toolbar: view selector, render mode, additive overlay checkboxes, fit/reset,
     * diagnostics indicator (spec 03 §7). */
    private renderControls(options: ViewerAttributeOptions): void {
      const result = this.result;
      if (!result) return;
      const bar = document.createElement("div");
      bar.className = "archmap-viewer-controls";
      bar.style.cssText =
        "display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 10px;" +
        "font:13px system-ui,sans-serif;border-bottom:1px solid #d4dae6;background:#f7f9fc;";

      const group = (label: string) => {
        const g = document.createElement("span");
        g.className = "archmap-controls-group";
        const l = document.createElement("span");
        l.className = "archmap-controls-label";
        l.textContent = label;
        g.appendChild(l);
        return g;
      };

      const active = { base: options.baseView ?? "overview", renderMode: options.renderMode, overlays: new Set(options.overlays) };

      const baseGroup = group("Views:");
      const baseButtons = new Map<string, HTMLButtonElement>();
      for (const view of BASE_VIEWS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = view[0].toUpperCase() + view.slice(1);
        btn.className = "archmap-control-base" + (view === active.base ? " is-active" : "");
        btn.addEventListener("click", () => {
          result.setBaseView(view);
          active.base = view;
          baseButtons.forEach((b, name) => b.classList.toggle("is-active", name === view));
          updateDiagnostics();
        });
        baseButtons.set(view, btn);
        baseGroup.appendChild(btn);
      }
      bar.appendChild(baseGroup);

      const modeGroup = group("Render modes:");
      const modeButtons = new Map<string, HTMLButtonElement>();
      for (const mode of RENDER_MODES) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = mode === "3d" ? "3D" : mode[0].toUpperCase() + mode.slice(1);
        btn.className = "archmap-control-render-mode" + (mode === active.renderMode ? " is-active" : "");
        btn.addEventListener("click", () => {
          result.setRenderMode(mode);
          active.renderMode = mode;
          modeButtons.forEach((b, name) => b.classList.toggle("is-active", name === mode));
          updateDiagnostics();
        });
        modeButtons.set(mode, btn);
        modeGroup.appendChild(btn);
      }
      bar.appendChild(modeGroup);

      const overlayGroup = group("Add info:");
      for (const overlay of OVERLAY_NAMES) {
        const wrap = document.createElement("label");
        wrap.className = "archmap-control-overlay";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = active.overlays.has(overlay);
        cb.addEventListener("change", () => {
          if (cb.checked) {
            active.overlays.add(overlay);
            result.addOverlay(overlay);
          } else {
            active.overlays.delete(overlay);
            result.removeOverlay(overlay);
          }
          updateDiagnostics();
        });
        wrap.append(cb, document.createTextNode(" " + overlay));
        overlayGroup.appendChild(wrap);
      }
      bar.appendChild(overlayGroup);

      const fit = document.createElement("button");
      fit.type = "button";
      fit.textContent = "Fit";
      fit.addEventListener("click", () => result.fit());
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Reset";
      reset.addEventListener("click", () => result.reset());
      bar.append(fit, reset);

      const diag = document.createElement("span");
      diag.className = "archmap-controls-diagnostics";
      diag.style.cssText = "margin-left:auto;color:#5b6b86;";
      const updateDiagnostics = () => {
        const m = result.model;
        diag.textContent = `Errors ${m.errors.length} / Warnings ${m.warnings.length} / Suggestions ${m.suggestions.length} / Infos ${m.infos.length}`;
      };
      updateDiagnostics();
      bar.appendChild(diag);

      this.controlsBar?.remove();
      this.controlsBar = bar;
      this.insertBefore(bar, this.firstChild);
    }

    private renderSourceFailure(src: string, error: unknown, options: ViewerAttributeOptions): void {
      const fallback = options.fallbackToInline ? this.source.trim() : "";
      const model = parse(fallback || "graph LR");
      const message = error instanceof Error ? error.message : String(error);
      model.errors.push(diagnostic("src_fetch_failed", `External ArchMap source "${src}" failed to load: ${message}.`, { type: "view", id: src }));
      syncDiagnostics(model);
      this.renderModel(model, options);
    }

    private async renderSource(): Promise<void> {
      const version = ++this.loadVersion;
      const options = viewerOptionsFromAttributes(this);
      let source = this.source.trim();
      if (options.src) {
        try {
          source = await fetchArchMapSource(options.src);
        } catch (e) {
          if (version === this.loadVersion) this.renderSourceFailure(options.src, e, options);
          return;
        }
      }
      if (version !== this.loadVersion) return;
      if (!source) return;
      this.renderModel(parse(source), options);
    }
  }

  customElements.define("archmap-viewer", ArchMapViewerElement);
}

/**
 * Browser runtime: scan the page for ArchMap blocks and render them in place
 * (§5, §27). Supports both raw ```archmap fences inside an element and elements
 * whose text content is already an ArchMap document.
 */
export function initialize(options: InitializeOptions = {}): void {
  if (typeof document === "undefined") return;
  if (options.defineCustomElement !== false) defineArchMapViewerElement();
  const selector = options.selector ?? "pre.archmap, code.language-archmap, .archmap-src";
  const defaultView = options.defaultView ?? "overview";

  const run = () => {
    const els = Array.from(document.querySelectorAll(selector));
    for (const el of els) {
      const raw = el.textContent ?? "";
      const blocks = extractArchMapBlocks(raw);
      const source = blocks.length > 0 ? blocks[0] : raw;
      if (source.trim() === "") continue;
      const model = parse(source);
      const container = document.createElement("div");
      container.className = "archmap-container";
      el.replaceWith(container);
      try {
        // Passing target lets render() inject SVG or mount a 3D view.
        render(model, { view: defaultView, target: container });
      } catch (e) {
        container.textContent = `ArchMap render error: ${(e as Error).message}`;
      }
    }
  };

  if (options.startOnLoad === false) return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
