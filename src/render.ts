/**
 * Render layer: view registry + the `render` / `initialize` API (§27).
 *
 * A view is a pure function from (model, layout) to an SVG string. This keeps
 * views testable headlessly and lets a future three.js view register the same
 * way and consume the same LayoutResult (with `z`).
 */

import { computeLayout } from "./layout.js";
import type { LayoutOptions, LayoutResult } from "./layout.js";
import { diagnostic, syncDiagnostics } from "./diagnostics.js";
import { parse } from "./parser-entry.js";
import { extractArchMapBlocks } from "./parser/sections.js";
import type { ArchMapModel, Direction } from "./types.js";
import { resolveNodeIcons } from "./icons.js";
import { overviewView } from "./views/overview.js";
import { zoneView } from "./views/zone.js";
import { authView } from "./views/auth.js";
import { dataflowView } from "./views/dataflow.js";
import { boundaryView } from "./views/boundary.js";
import { validationView } from "./views/validation.js";
import { renderDiagram } from "./views/base.js";
import { escapeXml } from "./views/svg.js";
import { buildOverlayProjection, OVERLAY_NAMES } from "./views/overlays.js";

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
  /** Stage 4 base-view API; prefer this for overview/zone/3d selection. */
  baseView?: string;
  /** Stage 4 overlay names toggled on top of the selected base view. */
  overlays?: string[];
  /** Legacy flat view selector. Kept for compatibility with existing callers. */
  view?: string;
  direction?: Direction;
  rankBy?: LayoutOptions["rankBy"];
  /** DOM element to inject the SVG into (browser only). */
  target?: Element | null;
  /** DOM element or selector to receive diagnostics after render. */
  diagnosticsTarget?: Element | string | null;
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
  setOverlays(overlays: string[]): void;
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

export function diagnosticsHtml(model: ArchMapModel): string {
  syncDiagnostics(model);
  const items = model.diagnostics
    .map((d) => {
      const target = d.target ? ` ${d.target.type}:${d.target.id}` : "";
      return `<li class="archmap-diagnostic archmap-diagnostic-${escapeXml(d.level ?? d.severity)}">` +
        `<strong>${escapeXml(d.code)}</strong>${escapeXml(target)}: ${escapeXml(d.message)}` +
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
const VIEW_RANK_BY: Record<string, LayoutOptions["rankBy"]> = {};

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
  if (overlays.length === 0 || (view !== "overview" && view !== "zone")) return undefined;
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
  return renderDiagram({
    layout,
    viewClass: view,
    boxGroups: [
      { boxes: layout.zones, boxClass: "archmap-zone" },
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
  const state = {
    view: options.baseView ?? options.view ?? metadataBaseView(model) ?? "overview",
    overlays: [...(options.overlays ?? metadataOverlays(model))],
  };

  const snapshot = (): Pick<RenderResult, "view" | "layout" | "model" | "svg" | "handle"> => {
    validateOverlays(model, state.overlays);
    const renderer = registry.get(state.view);
    if (!renderer) {
      model.warnings.push(diagnostic("unknown_base_view", `Unknown view "${state.view}". Registered views: ${listViews().join(", ") || "(none)"}.`, { type: "view", id: state.view }));
      syncDiagnostics(model);
      throw new Error(`Unknown view "${state.view}". Registered views: ${listViews().join(", ") || "(none)"}.`);
    }
    const rankBy = options.rankBy ?? VIEW_RANK_BY[state.view];
    const layout = computeLayout(model, { direction: options.direction, rankBy });
    const knownOverlays = state.overlays.filter((overlay) => OVERLAY_NAMES.has(overlay));
    const overlaidSvg = renderBaseViewWithOverlays(model, layout, state.view, knownOverlays);
    const out = overlaidSvg ?? renderer({ model, layout, options: { ...options, baseView: state.view, overlays: state.overlays } });

    if (typeof out === "string") {
      const svg = decorateSvgWithOverlays(out, knownOverlays);
      syncDiagnostics(model);
      renderDiagnostics(model, options.diagnosticsTarget);
      if (options.target && "innerHTML" in options.target) {
        options.target.innerHTML = svg;
      }
      return { view: state.view, layout, model, svg, handle: undefined };
    }
    const handle = options.target ? out.mount(options.target) : undefined;
    syncDiagnostics(model);
    renderDiagnostics(model, options.diagnosticsTarget);
    return { view: state.view, layout, model, handle, svg: undefined };
  };

  const result: RenderResult = {
    view: state.view,
    layout: computeLayout(model, { direction: options.direction, rankBy: options.rankBy ?? VIEW_RANK_BY[state.view] }),
    model,
    svg: undefined,
    handle: undefined,
    setBaseView(view: string) {
      state.view = view;
      apply(snapshot());
    },
    setOverlays(overlays: string[]) {
      state.overlays = [...overlays];
      apply(snapshot());
    },
    toggleOverlay(overlay: string) {
      state.overlays = state.overlays.includes(overlay)
        ? state.overlays.filter((entry) => entry !== overlay)
        : [...state.overlays, overlay];
      apply(snapshot());
    },
    fit() {},
    reset() {},
    destroy() {
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
  overlays: string[];
  width: string;
  height: string;
  src?: string;
  diagnostics: boolean;
  diagnosticsTarget?: string;
  fallbackToInline: boolean;
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
    overlays: parseOverlaysAttribute(attrs.getAttribute("overlays")),
    width: attrs.getAttribute("width") ?? "100%",
    height: attrs.getAttribute("height") ?? "600px",
    src: attrs.getAttribute("src") ?? undefined,
    diagnostics: attrs.getAttribute("diagnostics") === "true" || attrs.hasAttribute?.("diagnostics") === true,
    diagnosticsTarget: attrs.getAttribute("diagnostics-target") ?? undefined,
    fallbackToInline: attrs.hasAttribute?.("fallback-to-inline") === true,
  };
}

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
      return ["base-view", "overlays", "width", "height", "src", "diagnostics", "diagnostics-target", "fallback-to-inline"];
    }

    private source = "";
    private container?: HTMLDivElement;
    private diagnosticsPanel?: HTMLDivElement;
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

    private renderModel(model: ArchMapModel, options: ViewerAttributeOptions): void {
      this.applyFrameStyle();
      this.result?.destroy();
      this.result = render(model, {
        baseView: options.baseView,
        overlays: options.overlays,
        target: this.ensureContainer(),
        diagnosticsTarget: this.diagnosticsTarget(options),
      });
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
