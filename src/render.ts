/**
 * Render layer: view registry + the `render` / `initialize` API (§27).
 *
 * A view is a pure function from (model, layout) to an SVG string. This keeps
 * views testable headlessly and lets a future three.js view register the same
 * way and consume the same LayoutResult (with `z`).
 */

import { computeLayout, getLastLayoutTimings } from "./layout.js";
import type { LayoutOptions, LayoutResult, LayoutTimings } from "./layout.js";
import { diagnostic, diagnosticAppliesToView, syncDiagnostics, reportDiagnosticsToConsole } from "./diagnostics.js";
import type { ConsoleReportOptions, DiagnosticDisplayContext } from "./diagnostics.js";
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
import { prototypeView } from "./views/prototype.js";
import { renderDiagram } from "./views/base.js";
import type { Box } from "./views/base.js";
import { escapeXml } from "./views/svg.js";
import { buildOverlayProjection, OVERLAY_NAMES } from "./views/overlays.js";
import { buildTimeDecoration, computePhasePresence, listTimelinePhases, resolvePhaseId } from "./time-projection.js";
import type { PhasePresence } from "./time-projection.js";
import type { TimelinePhase } from "./types.js";
import { overviewZoneColorStyles } from "./views/zone-colors.js";
import { attachLabelPopups, attachPanZoom, isInteractiveTarget } from "./views/interaction.js";
import type { LabelPopupHandle, PanZoomHandle } from "./views/interaction.js";
import { renderInspector } from "./inspector.js";
import type { InspectorSelection } from "./inspector.js";
import { projectAbstraction } from "./subgraph-abstraction.js";
import type { AbstractionTarget } from "./subgraph-abstraction.js";
import { createDiagramTags } from "./controls/diagram-tags.js";
import type { DiagramTagsHandle } from "./controls/diagram-tags.js";

export interface ViewContext {
  model: ArchMapModel;
  layout: LayoutResult;
  options: RenderOptions;
}

export interface ExportPngOptions {
  /** Output scale multiplier for SVG-backed 2D exports. Default: 2. */
  scale?: number;
  /** Canvas background painted behind the diagram. Default: white. */
  background?: string;
}

/** Handle returned by an imperative (mounted) view, e.g. the WebGL 3D view. */
export interface ViewHandle {
  dispose(): void;
  exportPng?(options?: ExportPngOptions): Promise<Blob> | Blob;
  setScenario?(id: string): void;
  getScenario?(): string | null;
  goToScreen?(id: string): void;
  getCurrentScreen?(): string | null;
  next?(): void;
  back?(): void;
  toggleHotspots?(enabled?: boolean): void;
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
  /** Legacy depth-based collapse control kept for compatibility. Prefer click-driven collapsedAbstractions. */
  abstractionLevel?: number;
  /** Which authoring hierarchy the legacy depth collapse targets. */
  abstractionTarget?: AbstractionTarget;
  /** Abstraction keys (`subgraph:X` / `zone:Y`) to leave expanded. */
  expandedAbstractions?: string[];
  /** Abstraction keys (`subgraph:X` / `zone:Y`) currently collapsed by interaction. */
  collapsedAbstractions?: string[];
  /** When true, clickable abstraction/area expand-collapse interactions are disabled. */
  abstractionLocked?: boolean;
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
  /** Prototype View scenario id. */
  scenario?: string;
  /** Prototype View hotspot visibility. */
  showHotspots?: boolean;
  /** Timeline phase to display (v0.2 4D). Defaults to the timeline default. */
  phase?: string;
  /** Report diagnostics to the console (spec 02 §23). Default: off for the
   * programmatic API; engines (viewer/initialize) default it on. */
  console?: boolean | ConsoleReportOptions;
  /** Enable SVG pan/zoom on the target for 2D views (default on with a DOM target). */
  interactive?: boolean;
}

/** Phase timings (ms) for the most recent render pass. Additive diagnostic aid. */
export interface RenderTimings {
  totalMs: number;
  projectionMs: number;
  layoutMs: number;
  /** SVG string generation (2D) or mountable-view construction (3D/prototype). */
  viewMs: number;
  /** Target DOM update, when a target element was supplied. */
  domMs: number;
  layoutPhases?: LayoutTimings;
}

export interface RenderResult {
  view: string;
  layout: LayoutResult;
  model: ArchMapModel;
  /** Present for SVG (2D) views. */
  svg?: string;
  /** Present for mounted (3D) views when a target was supplied. */
  handle?: ViewHandle;
  /** Phase timings for the most recent render pass (milliseconds). */
  timings?: RenderTimings;
  setBaseView(view: string): void;
  setRenderMode(mode: string): void;
  setOverlays(overlays: string[]): void;
  setAbstractionLevel(level: number): void;
  setAbstractionTarget(target: AbstractionTarget): void;
  collapseAbstraction(key: string): void;
  expandAbstraction(key: string): void;
  toggleAbstraction(key: string): void;
  setAbstractionLocked(locked: boolean): void;
  isAbstractionLocked(): boolean;
  addOverlay(overlay: string): void;
  removeOverlay(overlay: string): void;
  toggleOverlay(overlay: string): void;
  /** Switch the active timeline phase (null restores the default). No-op without a timeline. */
  setPhase(id: string | null): void;
  /** Active timeline phase id, or null when the model has no timeline. */
  getPhase(): string | null;
  /** Ordered timeline phases ([] without a timeline). */
  listPhases(): TimelinePhase[];
  fit(): void;
  reset(): void;
  exportPng(options?: ExportPngOptions): Promise<Blob>;
  downloadPng(filename?: string, options?: ExportPngOptions): Promise<void>;
  exportSvg(): string;
  downloadSvg(filename?: string): Promise<void>;
  setScenario?(id: string): void;
  getScenario?(): string | null;
  goToScreen?(id: string): void;
  getCurrentScreen?(): string | null;
  next?(): void;
  back?(): void;
  toggleHotspots?(enabled?: boolean): void;
  destroy(): void;
}

const registry = new Map<string, ViewRenderer>();

export function registerView(name: string, renderer: ViewRenderer): void {
  registry.set(name, renderer);
}

export function getView(name: string): ViewRenderer | undefined {
  return registry.get(name);
}

function prototypePlaceholderLayout(model: ArchMapModel): LayoutResult {
  return {
    direction: model.direction,
    width: 1,
    height: 1,
    depth: 1,
    nodes: model.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      shape: node.shape,
      x: 0,
      y: 0,
      z: 0,
      w: 1,
      h: 1,
      abstraction: node.abstraction,
    })),
    zones: [],
    boundaries: [],
    edges: [],
  };
}

function layoutForRenderState(model: ArchMapModel, state: { requestedView: string; view: string }, options: RenderOptions): LayoutResult {
  return state.view === "prototype"
    ? prototypePlaceholderLayout(model)
    : computeLayout(model, layoutOptionsForState(state, options));
}

export function listViews(): string[] {
  return [...registry.keys()];
}

function currentTargetSvg(target: Element | null | undefined): string | undefined {
  const svg = target?.querySelector?.("svg.archmap");
  if (!svg) return undefined;
  if ("outerHTML" in svg && typeof svg.outerHTML === "string") return svg.outerHTML;
  if (typeof XMLSerializer !== "undefined") return new XMLSerializer().serializeToString(svg);
  return undefined;
}

function svgDimensions(svg: string): { width: number; height: number } {
  const numericAttr = (name: string): number | undefined => {
    const match = svg.match(new RegExp(`\\s${name}="([^"]+)"`));
    if (!match) return undefined;
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const width = numericAttr("width");
  const height = numericAttr("height");
  if (width && height) return { width, height };

  const viewBoxMatch = svg.match(/\sviewBox="([^"]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return { width: 1200, height: 800 };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create PNG blob from canvas."));
    }, "image/png");
  });
}

async function svgToPngBlob(svg: string, options: ExportPngOptions = {}): Promise<Blob> {
  if (typeof document === "undefined" || typeof Image === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    throw new Error("PNG export requires a browser DOM.");
  }
  const { width, height } = svgDimensions(svg);
  const scale = Math.max(0.25, Math.min(6, options.scale ?? 2));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PNG export could not create a 2D canvas context.");
  ctx.fillStyle = options.background ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("PNG export could not load the rendered SVG."));
      image.src = objectUrl;
    });
    ctx.drawImage(image, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function downloadBlob(blob: Blob, filename: string, extension = "png"): Promise<void> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Download requires a browser DOM.");
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function diagnosticLabel(items: ArchMapModel["diagnostics"]): string {
  const errors = items.filter((d) => d.level === "error").length;
  const warnings = items.filter((d) => d.level === "warning").length;
  const suggestions = items.filter((d) => d.level === "suggestion").length;
  const infos = items.filter((d) => d.level === "info").length;
  return `Errors ${errors} / Warnings ${warnings} / Suggestions ${suggestions} / Infos ${infos}`;
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

function setTargetAbstractionLocked(target: Element | null | undefined, locked: boolean): void {
  const svg = target?.querySelector?.("svg.archmap");
  svg?.classList.toggle("archmap-abstraction-locked", locked);
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) target.classList.toggle("archmap-abstraction-locked", locked);
}

function attachAbstractionToggles(target: Element, collapse: (key: string) => void, expand: (key: string) => void, locked: () => boolean): () => void {
  const handler = (event: Event) => {
    const source = event.target instanceof Element ? event.target : null;
    const abstractionNode = source?.closest(".archmap-node[data-abstraction-key]");
    const abstractionKey = abstractionNode?.getAttribute("data-abstraction-key");
    if (abstractionKey) {
      if (locked()) return;
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      expand(abstractionKey);
      return;
    }
    const zone = source?.closest(".archmap-zone[data-id]");
    const zoneId = zone?.getAttribute("data-id");
    if (zoneId) {
      if (locked()) return;
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      collapse(`zone:${zoneId}`);
      return;
    }
    const subgraph = source?.closest(".archmap-subgraph[data-id]");
    const subgraphId = subgraph?.getAttribute("data-id");
    if (!subgraphId) return;
    if (locked()) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    collapse(`subgraph:${subgraphId}`);
  };
  target.addEventListener("click", handler, { capture: true });
  return () => target.removeEventListener("click", handler, { capture: true });
}

export function diagnosticsHtml(model: ArchMapModel, context?: DiagnosticDisplayContext): string {
  syncDiagnostics(model);
  const items = model.diagnostics
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => diagnosticAppliesToView(d, context));
  const listItems = items
    .map(({ d, index }) => {
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
    `<div class="archmap-diagnostics-summary">${escapeXml(diagnosticLabel(items.map(({ d }) => d)))}</div>` +
    `<ul>${listItems}</ul>` +
    `</div>`
  );
}

export function renderDiagnostics(model: ArchMapModel, target: Element | string | null | undefined, context?: DiagnosticDisplayContext): string {
  const html = diagnosticsHtml(model, context);
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
registerView("prototype", prototypeView);
registerView("3d", ({ model }) => {
  model.warnings.push(diagnostic("view_3d_unavailable", "3D renderer is not installed. Import @archmap/core/views3d/three-view and call installThreeView() to enable it.", { type: "view", id: "3d" }));
  return (
    `<svg class="archmap archmap-view-3d archmap-view-unavailable" viewBox="0 0 640 220" width="640" height="220" xmlns="http://www.w3.org/2000/svg">` +
    `<style>.archmap-view-unavailable text{font:500 14px system-ui,sans-serif;fill:#3a4a63}.archmap-view-unavailable rect{fill:#fff7ed;stroke:#c85a46;stroke-width:1.5}</style>` +
    `<rect x="16" y="16" width="608" height="188" rx="8" ry="8" />` +
    `<text x="40" y="86">${escapeXml("3D view is not installed in the core bundle.")}</text>` +
    `<text x="40" y="116">${escapeXml("Import @archmap/core/views3d/three-view and call installThreeView().")}</text>` +
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

const OVERVIEW_LANE_GAP = 96;

function layoutOptionsForState(
  state: { requestedView: string; view: string },
  options: RenderOptions,
): LayoutOptions {
  return {
    direction: options.direction,
    rankBy: options.rankBy ?? VIEW_RANK_BY[state.requestedView] ?? VIEW_RANK_BY[state.view],
    laneBy: VIEW_LANE_BY[state.requestedView] ?? VIEW_LANE_BY[state.view],
    laneGap: state.requestedView === "overview" ? OVERVIEW_LANE_GAP : undefined,
    stackZoneBlocks: state.requestedView === "layer",
  };
}

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

function renderBaseViewWithOverlays(model: ArchMapModel, layout: LayoutResult, view: string, overlays: string[], presence?: PhasePresence): string | undefined {
  // An active timeline phase routes zero-overlay renders through this shared
  // path too, so time decoration lands in the same renderDiagram spec.
  if ((overlays.length === 0 && !presence) || (view !== "overview" && view !== "zone" && view !== "layer")) return undefined;
  const projection = buildOverlayProjection(model, layout, overlays, presence ? { phase: presence.phaseId, baseView: view, view } : { baseView: view, view });
  const timeDecoration = presence ? buildTimeDecoration(presence) : undefined;
  const collapsedZoneIds = new Set(model.nodes
    .filter((node) => node.abstraction?.target === "zone")
    .map((node) => node.abstraction!.id));
  const collapsedSubgraphIds = new Set(model.nodes
    .filter((node) => node.abstraction?.target === "subgraph")
    .map((node) => node.abstraction!.id));
  const visibleZoneBoxes = <T extends Box>(boxes: T[]): T[] => (
    collapsedZoneIds.size === 0 ? boxes : boxes.filter((box) => !collapsedZoneIds.has(box.id))
  );
  const visibleSubgraphBoxes = <T extends Box>(boxes: T[]): T[] => (
    collapsedSubgraphIds.size === 0 ? boxes : boxes.filter((box) => !collapsedSubgraphIds.has(box.id))
  );
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
      ? [{ boxes: visibleZoneBoxes(layout.zones), boxClass: "archmap-zone" }]
      : [];
  const projectionBoxGroups = projection.boxGroups?.map((group) => (
    group.boxClass === "archmap-zone"
      ? { ...group, boxes: visibleZoneBoxes(group.boxes) }
      : group.boxClass === "archmap-subgraph"
        ? { ...group, boxes: visibleSubgraphBoxes(group.boxes) }
      : group
  ));
  const zoneStyles = view === "overview" ? overviewZoneColorStyles(model, layout) : undefined;
  return renderDiagram({
    layout,
    viewClass: view,
    boxGroups: [
      ...baseBoxGroups,
      ...(projectionBoxGroups ?? []),
    ],
    emphasizeNodes: projection.emphasizeNodes,
    emphasizeEdges,
    nodeBadges: projection.nodeBadges,
    edgeBadges: projection.edgeBadges,
    overlayEdges: projection.overlayEdges,
    nodeIcons: resolveNodeIcons(model),
    nodeExtraClasses: timeDecoration?.nodeExtraClasses,
    edgeExtraClasses: timeDecoration?.edgeExtraClasses,
    boxExtraClasses: timeDecoration?.boxExtraClasses,
    ...(zoneStyles ?? {}),
  });
}

/** Stamp the active timeline phase onto the SVG root for host CSS/tooling. */
function decorateSvgWithPhase(svg: string, phaseId: string | undefined): string {
  if (!phaseId) return svg;
  const safe = phaseId.replace(/[^a-z0-9_-]/gi, "-");
  return svg.replace(/^<svg\b([^>]*)>/, (_match, attrs: string) => {
    const withClasses = attrs.includes('class="')
      ? attrs.replace(/class="([^"]*)"/, `class="$1 archmap-phase-${safe}"`)
      : `${attrs} class="archmap-phase-${safe}"`;
    return `<svg${withClasses} data-phase="${escapeXml(phaseId)}">`;
  });
}

function decorateSvgWithAbstractionLock(svg: string, locked: boolean): string {
  if (!locked) return svg;
  return svg.replace(/<svg([^>]*)class="([^"]*)"/, (_match, before: string, classes: string) => {
    if (classes.includes("archmap-abstraction-locked")) return `<svg${before}class="${classes}"`;
    return `<svg${before}class="${classes} archmap-abstraction-locked"`;
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
    abstractionLevel: Math.max(0, Math.floor(options.abstractionLevel ?? 0)),
    abstractionTarget: options.abstractionTarget ?? "subgraph" as AbstractionTarget,
    expandedAbstractions: new Set(options.expandedAbstractions ?? []),
    collapsedAbstractions: new Set(options.collapsedAbstractions ?? []),
    abstractionLocked: options.abstractionLocked === true,
    // Undefined without a timeline: the render then behaves exactly as v0.1.
    phase: resolvePhaseId(model, options.phase),
  };
  let panZoom: PanZoomHandle | undefined;
  let preservePanZoomOnNextRender = false;
  let detachInspector: (() => void) | undefined;
  let detachDiagnostics: (() => void) | undefined;
  let detachAbstractionToggles: (() => void) | undefined;
  let labelPopups: LabelPopupHandle | undefined;

  // Overlay toggles and repeated renders reuse the abstraction projection and
  // layout: neither depends on the overlay set, and layout is the dominant
  // render cost on larger diagrams.
  let cache: { projectionKey: string; model: ArchMapModel; layoutKey?: string; layout?: LayoutResult } | undefined;
  const projectionKeyNow = (): string =>
    `${state.abstractionLevel}|${state.abstractionTarget}|${[...state.expandedAbstractions].sort().join(",")}|${[...state.collapsedAbstractions].sort().join(",")}`;
  const effectiveModelNow = (): ArchMapModel => {
    const key = projectionKeyNow();
    if (cache?.projectionKey !== key) {
      cache = {
        projectionKey: key,
        model: projectAbstraction(model, state.abstractionLevel, state.abstractionTarget, state.expandedAbstractions, state.collapsedAbstractions),
      };
    }
    return cache!.model;
  };
  const layoutNow = (effectiveModel: ArchMapModel): LayoutResult => {
    const layoutKey = `${state.view}|${state.requestedView}`;
    if (cache && cache.model === effectiveModel && cache.layoutKey === layoutKey && cache.layout) return cache.layout;
    const layout = layoutForRenderState(effectiveModel, state, options);
    if (cache && cache.model === effectiveModel) {
      cache.layoutKey = layoutKey;
      cache.layout = layout;
    }
    return layout;
  };

  let lastTimings: RenderTimings | undefined;
  const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const snapshot = (): Pick<RenderResult, "view" | "layout" | "model" | "svg" | "handle"> => {
    const renderStarted = nowMs();
    const effectiveModel = effectiveModelNow();
    const projectionDone = nowMs();
    validateOverlays(effectiveModel, state.overlays);
    const renderer = registry.get(state.view);
    if (!renderer) {
      effectiveModel.warnings.push(diagnostic("unknown_base_view", `Unknown view "${state.view}". Registered views: ${listViews().join(", ") || "(none)"}.`, { type: "view", id: state.view }));
      syncDiagnostics(effectiveModel);
      throw new Error(`Unknown view "${state.view}". Registered views: ${listViews().join(", ") || "(none)"}.`);
    }
    const knownOverlays = state.overlays.filter((overlay) => OVERLAY_NAMES.has(overlay));
    const layout = layoutNow(effectiveModel);
    const layoutDone = nowMs();
    // Time projection is decoration-only and computed AFTER cache resolution:
    // the phase must never enter projectionKeyNow() or the layout key, so
    // phase switches reuse both cached artifacts. (A future absent="hidden"
    // mode would have to join the projection key instead.)
    const presence = state.phase ? computePhasePresence(effectiveModel, state.phase) : undefined;
    const renderOptions = { ...options, baseView: state.requestedView, renderMode: state.renderMode, overlays: state.overlays, abstractionLevel: state.abstractionLevel, abstractionTarget: state.abstractionTarget, phase: state.phase };
    const diagnosticContext = { baseView: state.requestedView, view: state.view };
    const overlaidSvg = state.view === "prototype" ? undefined : renderBaseViewWithOverlays(effectiveModel, layout, state.view, knownOverlays, presence);
    const out = overlaidSvg ?? renderer({ model: effectiveModel, layout, options: renderOptions });
    const viewDone = nowMs();
    const finishTimings = (): void => {
      const domDone = nowMs();
      lastTimings = {
        totalMs: domDone - renderStarted,
        projectionMs: projectionDone - renderStarted,
        layoutMs: layoutDone - projectionDone,
        viewMs: viewDone - layoutDone,
        domMs: domDone - viewDone,
        layoutPhases: getLastLayoutTimings(),
      };
    };

    if (typeof out === "string") {
      const svg = decorateSvgWithAbstractionLock(
        decorateSvgWithSelection(
          decorateSvgWithPhase(decorateSvgWithOverlays(out, knownOverlays), state.view === "prototype" ? undefined : state.phase),
          effectiveModel,
          options.selection,
        ),
        state.abstractionLocked,
      );
      syncDiagnostics(effectiveModel);
      renderDiagnostics(effectiveModel, options.diagnosticsTarget, diagnosticContext);
      renderInspector(effectiveModel, options.selection ?? null, options.inspectorTarget);
      if (options.console !== undefined) reportDiagnosticsToConsole(effectiveModel, options.console);
      if (options.target && "innerHTML" in options.target) {
        const preservedPanZoom = preservePanZoomOnNextRender ? panZoom?.get() : undefined;
        options.target.innerHTML = svg;
        setTargetAbstractionLocked(options.target, state.abstractionLocked);
        panZoom?.dispose();
        panZoom = undefined;
        preservePanZoomOnNextRender = false;
        detachInspector?.();
        detachInspector = undefined;
        detachDiagnostics?.();
        detachDiagnostics = undefined;
        detachAbstractionToggles?.();
        detachAbstractionToggles = undefined;
        labelPopups?.dispose();
        labelPopups = undefined;
        if (isInteractiveTarget(options.target)) {
          if (options.interactive !== false) {
            panZoom = attachPanZoom(options.target, preservedPanZoom);
          }
          labelPopups = attachLabelPopups(options.target);
        }
        if ("addEventListener" in options.target && "dispatchEvent" in options.target) {
          detachAbstractionToggles = attachAbstractionToggles(
            options.target,
            (key) => result.collapseAbstraction(key),
            (key) => result.expandAbstraction(key),
            () => state.abstractionLocked,
          );
        }
        if (options.inspectorTarget && "addEventListener" in options.target && "dispatchEvent" in options.target) {
          detachInspector = attachInspectorSelection(options.target, effectiveModel, options.inspectorTarget);
        }
        if (options.diagnosticsTarget && "addEventListener" in options.target && "dispatchEvent" in options.target) {
          detachDiagnostics = attachDiagnosticSelection(options.target, effectiveModel, options.diagnosticsTarget, options.inspectorTarget);
        }
      }
      finishTimings();
      return { view: state.view, layout, model: effectiveModel, svg, handle: undefined };
    }
    panZoom?.dispose();
    panZoom = undefined;
    labelPopups?.dispose();
    labelPopups = undefined;
    detachInspector?.();
    detachInspector = undefined;
    detachDiagnostics?.();
    detachDiagnostics = undefined;
    detachAbstractionToggles?.();
    detachAbstractionToggles = undefined;
    const handle = options.target ? out.mount(options.target) : undefined;
    finishTimings();
    preservePanZoomOnNextRender = false;
    syncDiagnostics(effectiveModel);
    renderDiagnostics(effectiveModel, options.diagnosticsTarget, diagnosticContext);
    renderInspector(effectiveModel, options.selection ?? null, options.inspectorTarget);
    if (options.console !== undefined) reportDiagnosticsToConsole(effectiveModel, options.console);
    return { view: state.view, layout, model: effectiveModel, handle, svg: undefined };
  };

  const initialModel = effectiveModelNow();

  const result: RenderResult = {
    view: state.view,
    layout: layoutNow(initialModel),
    model: initialModel,
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
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    setAbstractionLevel(level: number) {
      state.abstractionLevel = Math.max(0, Math.floor(level));
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    setAbstractionTarget(target: AbstractionTarget) {
      state.abstractionTarget = target;
      state.expandedAbstractions.clear();
      state.collapsedAbstractions.clear();
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    collapseAbstraction(key: string) {
      state.expandedAbstractions.delete(key);
      state.collapsedAbstractions.add(key);
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    expandAbstraction(key: string) {
      state.collapsedAbstractions.delete(key);
      state.expandedAbstractions.add(key);
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    toggleAbstraction(key: string) {
      if (state.collapsedAbstractions.has(key)) {
        result.expandAbstraction(key);
      } else {
        result.collapseAbstraction(key);
      }
    },
    setAbstractionLocked(locked: boolean) {
      state.abstractionLocked = locked;
      setTargetAbstractionLocked(options.target, locked);
    },
    isAbstractionLocked() {
      return state.abstractionLocked;
    },
    addOverlay(overlay: string) {
      if (!state.overlays.includes(overlay)) state.overlays = [...state.overlays, overlay];
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    removeOverlay(overlay: string) {
      state.overlays = state.overlays.filter((entry) => entry !== overlay);
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    toggleOverlay(overlay: string) {
      state.overlays = state.overlays.includes(overlay)
        ? state.overlays.filter((entry) => entry !== overlay)
        : [...state.overlays, overlay];
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    setPhase(id: string | null) {
      const next = resolvePhaseId(model, id);
      if (next === undefined || next === state.phase) return; // no timeline / no change
      state.phase = next;
      preservePanZoomOnNextRender = true;
      apply(snapshot());
    },
    getPhase() {
      return state.phase ?? null;
    },
    listPhases() {
      return listTimelinePhases(model).map((phase) => ({ ...phase }));
    },
    fit() {
      panZoom?.fit();
    },
    reset() {
      panZoom?.reset();
    },
    async exportPng(exportOptions?: ExportPngOptions) {
      if (result.handle?.exportPng) return await result.handle.exportPng(exportOptions);
      const svg = result.svg ?? currentTargetSvg(options.target);
      if (!svg) throw new Error("No exportable ArchMap render is available.");
      return await svgToPngBlob(svg, exportOptions);
    },
    async downloadPng(filename = "archmap.png", exportOptions?: ExportPngOptions) {
      const blob = await result.exportPng(exportOptions);
      await downloadBlob(blob, filename, "png");
    },
    exportSvg() {
      if (!result.svg) {
        throw new Error("SVG export is only available for SVG-backed 2D views.");
      }
      return result.svg;
    },
    async downloadSvg(filename = "archmap.svg") {
      if (typeof Blob === "undefined") throw new Error("SVG download requires Blob support.");
      const svg = result.exportSvg();
      await downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename, "svg");
    },
    setScenario(id: string) {
      result.handle?.setScenario?.(id);
    },
    getScenario() {
      return result.handle?.getScenario?.() ?? null;
    },
    goToScreen(id: string) {
      result.handle?.goToScreen?.(id);
    },
    getCurrentScreen() {
      return result.handle?.getCurrentScreen?.() ?? null;
    },
    next() {
      result.handle?.next?.();
    },
    back() {
      result.handle?.back?.();
    },
    toggleHotspots(enabled?: boolean) {
      result.handle?.toggleHotspots?.(enabled);
    },
    destroy() {
      panZoom?.dispose();
      panZoom = undefined;
      detachInspector?.();
      detachInspector = undefined;
      detachDiagnostics?.();
      detachDiagnostics = undefined;
      detachAbstractionToggles?.();
      detachAbstractionToggles = undefined;
      labelPopups?.dispose();
      labelPopups = undefined;
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
    result.model = next.model;
    result.svg = next.svg;
    result.handle = next.handle;
    result.timings = lastTimings;
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
  abstractionLevel: number;
  abstractionTarget: AbstractionTarget;
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
  scenario?: string;
  showHotspots: boolean;
  /** Timeline phase to display (v0.2 4D). */
  phase?: string;
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
    abstractionLevel: Number(attrs.getAttribute("abstraction-level") ?? 0) || 0,
    abstractionTarget: attrs.getAttribute("abstraction-target") === "zone" ? "zone" : "subgraph",
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
    scenario: attrs.getAttribute("scenario") ?? undefined,
    showHotspots: attrs.getAttribute("show-hotspots") === "true" || attrs.hasAttribute?.("show-hotspots") === true,
    phase: attrs.getAttribute("phase") ?? undefined,
  };
}

/** Semantic views offered by the controls toolbar: what the user wants to inspect. */
export const BASE_VIEWS = ["overview", "layer", "prototype"] as const;
const BASE_VIEW_LABELS: Record<(typeof BASE_VIEWS)[number], string> = {
  overview: "Overview",
  layer: "Layer",
  prototype: "Prototype",
};
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
      return ["base-view", "render-mode", "overlays", "abstraction-level", "abstraction-target", "width", "height", "src", "diagnostics", "diagnostics-target", "inspector", "inspector-target", "fallback-to-inline", "console", "controls", "scenario", "show-hotspots", "phase"];
    }

    private source = "";
    private container?: HTMLDivElement;
    private diagnosticsPanel?: HTMLDivElement;
    private inspectorPanel?: HTMLDivElement;
    private controlsHandle?: DiagramTagsHandle;
    private controlsHost?: HTMLDivElement;
    private loadingPanel?: HTMLDivElement;
    private result?: RenderResult;
    private loadVersion = 0;
    private loadingSince = 0;
    private loadingHideTimer = 0;
    private detachPrototypeRenderState?: () => void;

    connectedCallback(): void {
      if (!this.source) this.source = this.textContent ?? "";
      void this.renderSource();
    }

    disconnectedCallback(): void {
      this.result?.destroy();
      this.result = undefined;
      this.detachPrototypeRenderState?.();
      this.detachPrototypeRenderState = undefined;
    }

    attributeChangedCallback(name: string): void {
      if (!this.isConnected) return;
      if (!this.result) {
        void this.renderSource();
        return;
      }
      const options = viewerOptionsFromAttributes(this);
      if (name === "base-view" && options.baseView) {
        this.runWithLoading(() => this.result?.setBaseView(options.baseView!));
      } else if (name === "render-mode") {
        this.runWithLoading(() => this.result?.setRenderMode(options.renderMode));
      } else if (name === "overlays") {
        this.runWithLoading(() => this.result?.setOverlays(options.overlays));
      } else if (name === "abstraction-level") {
        this.runWithLoading(() => this.result?.setAbstractionLevel(options.abstractionLevel));
      } else if (name === "abstraction-target") {
        this.runWithLoading(() => this.result?.setAbstractionTarget(options.abstractionTarget));
      } else if (name === "scenario" && options.scenario) {
        this.runWithLoading(() => this.result?.setScenario?.(options.scenario!));
      } else if (name === "phase") {
        // Removing the attribute restores the timeline default.
        this.runWithLoading(() => this.result?.setPhase(options.phase ?? null));
      } else if (name === "show-hotspots") {
        this.runWithLoading(() => this.result?.toggleHotspots?.(options.showHotspots));
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

    private ensureLoadingPanel(): HTMLDivElement {
      this.ensureContainer();
      if (this.loadingPanel?.isConnected) return this.loadingPanel;
      const panel = document.createElement("div");
      panel.className = "archmap-viewer-loading";
      panel.innerHTML = '<span class="archmap-loading-spinner" aria-hidden="true"></span><span>Rendering</span>';
      panel.style.cssText =
        "position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:10px;" +
        "background:rgba(248,250,252,0.62);backdrop-filter:blur(1px);color:#334155;" +
        "font:700 13px system-ui,sans-serif;z-index:20;pointer-events:none;";
      const spinner = panel.querySelector(".archmap-loading-spinner") as HTMLElement | null;
      if (spinner) {
        spinner.style.cssText =
          "width:22px;height:22px;border-radius:999px;border:3px solid rgba(100,116,139,0.25);" +
          "border-top-color:#2563eb;animation:archmap-spin 0.75s linear infinite;";
      }
      this.appendChild(panel);
      this.loadingPanel = panel;
      return panel;
    }

    private ensureLoadingStyle(): void {
      const doc = this.ownerDocument;
      if (doc.getElementById("archmap-viewer-loading-style")) return;
      const style = doc.createElement("style");
      style.id = "archmap-viewer-loading-style";
      style.textContent = "@keyframes archmap-spin{to{transform:rotate(360deg)}}";
      doc.head.appendChild(style);
    }

    private showLoading(): void {
      clearTimeout(this.loadingHideTimer);
      this.loadingSince = performance.now();
      this.ensureLoadingStyle();
      const panel = this.ensureLoadingPanel();
      panel.style.display = "flex";
    }

    private hideLoading(): void {
      const remaining = Math.max(0, 220 - (performance.now() - this.loadingSince));
      clearTimeout(this.loadingHideTimer);
      this.loadingHideTimer = window.setTimeout(() => {
        if (this.loadingPanel) this.loadingPanel.style.display = "none";
      }, remaining);
    }

    private runWithLoading(action: () => void): void {
      this.showLoading();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            action();
          } finally {
            if (this.container?.querySelector(".archmap-prototype-flow-loading")) return;
            requestAnimationFrame(() => this.hideLoading());
          }
        });
      });
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
      this.style.position = this.style.position || "relative";
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
      this.detachPrototypeRenderState?.();
      this.detachPrototypeRenderState = undefined;
      const container = this.ensureContainer();
      const onPrototypeRenderState = (event: Event): void => {
        const state = (event as CustomEvent<{ state?: string }>).detail?.state;
        if (state === "loading") this.showLoading();
        if (state === "ready") this.hideLoading();
      };
      container.addEventListener("archmap:prototype-render-state", onPrototypeRenderState);
      this.detachPrototypeRenderState = () => container.removeEventListener("archmap:prototype-render-state", onPrototypeRenderState);
      this.result = render(model, {
        baseView: options.baseView,
        renderMode: options.renderMode,
        overlays: options.overlays,
        abstractionLevel: options.abstractionLevel,
        abstractionTarget: options.abstractionTarget,
        target: container,
        diagnosticsTarget: this.diagnosticsTarget(options),
        inspectorTarget: this.inspectorTarget(options),
        console: options.consoleReport,
        scenario: options.scenario,
        showHotspots: options.showHotspots,
        phase: options.phase,
      });
      if (options.controls) this.renderControls(options);
      else {
        this.controlsHandle?.destroy();
        this.controlsHost?.remove();
        this.controlsHandle = undefined;
        this.controlsHost = undefined;
      }
    }

    /** Controls toolbar: exclusive view/mode radios, additive overlay tags, fit/reset,
     * diagnostics indicator (spec 03 §7). */
    private renderControls(options: ViewerAttributeOptions): void {
      const result = this.result;
      if (!result) return;
      let zoomFitted = false;
      const timelinePhases = result.listPhases();
      let controlsState = {
        baseView: options.baseView ?? "overview",
        renderMode: options.renderMode,
        overlays: [...options.overlays],
        abstractionLocked: result.isAbstractionLocked(),
        phase: result.getPhase() ?? undefined,
      };
      const updateDiagnostics = () => {
        this.controlsHandle?.setState(controlsState);
      };
      const target = document.createElement("div");
      target.className = "archmap-viewer-controls";
      target.style.cssText = "border-bottom:1px solid #d4dae6;background:#f7f9fc;padding:8px 10px;";
      this.controlsHandle?.destroy();
      this.controlsHost?.remove();
      this.controlsHandle = createDiagramTags({
        target,
        views: BASE_VIEWS.map((view) => ({ value: view, label: BASE_VIEW_LABELS[view] })),
        renderModes: RENDER_MODES.map((mode) => ({ value: mode, label: mode === "3d" ? "3D" : mode.toUpperCase() })),
        overlays: [...OVERLAY_NAMES].map((overlay) => ({ value: overlay, label: overlay })),
        timeline: timelinePhases.length > 0
          ? { phases: timelinePhases.map((phase) => ({ value: phase.id, label: phase.label ?? phase.id })) }
          : undefined,
        actions: ["toggleSize", "fit", "lock", "download", "fullscreen"],
        state: {
          ...controlsState,
        },
        names: {
          baseView: `archmap-base-view-${Math.random().toString(36).slice(2)}`,
          renderMode: `archmap-render-mode-${Math.random().toString(36).slice(2)}`,
          overlay: `archmap-overlay-${Math.random().toString(36).slice(2)}`,
        },
        onChange: (_state, event) => {
          this.runWithLoading(() => {
            if (event.kind === "baseView") {
              result.setBaseView(event.value);
              controlsState = { ...controlsState, baseView: event.value };
            }
            if (event.kind === "renderMode") {
              result.setRenderMode(event.value);
              controlsState = { ...controlsState, renderMode: event.value };
            }
            if (event.kind === "overlay") {
              if (event.checked) result.addOverlay(event.value);
              else result.removeOverlay(event.value);
              controlsState = {
                ...controlsState,
                overlays: event.checked
                  ? [...new Set([...controlsState.overlays, event.value])]
                  : controlsState.overlays.filter((overlay) => overlay !== event.value),
              };
            }
            if (event.kind === "phase") {
              result.setPhase(event.value);
              controlsState = { ...controlsState, phase: result.getPhase() ?? undefined };
            }
            updateDiagnostics();
          });
        },
        onAction: (action) => {
          if (action === "fit") {
            if (zoomFitted) {
              result.reset();
              zoomFitted = false;
            } else {
              result.fit();
              zoomFitted = true;
            }
            return;
          }
          if (action === "lock") {
            result.setAbstractionLocked(!result.isAbstractionLocked());
            controlsState = { ...controlsState, abstractionLocked: result.isAbstractionLocked() };
            updateDiagnostics();
            return;
          }
          if (action === "download") {
            void result.downloadPng("archmap.png").catch((error: unknown) => {
              console.error("ArchMap PNG export failed.", error);
            });
            return;
          }
          if (action === "fullscreen") {
            if (document.fullscreenElement === this) {
              void document.exitFullscreen?.();
            } else if (this.requestFullscreen) {
              void this.requestFullscreen();
            }
            requestAnimationFrame(() => result.fit());
          }
        },
      });
      this.controlsHandle.element.style.position = "static";
      this.controlsHandle.element.style.width = "auto";
      this.controlsHandle.element.style.marginBottom = "0";
      this.controlsHost = target;
      this.insertBefore(target, this.firstChild);
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
      this.showLoading();
      let source = this.source.trim();
      try {
        if (options.src) {
          source = await fetchArchMapSource(options.src);
        }
        if (version !== this.loadVersion) return;
        if (!source) return;
        this.renderModel(parse(source), options);
      } catch (e) {
        if (version === this.loadVersion && options.src) this.renderSourceFailure(options.src, e, options);
        else if (version === this.loadVersion) throw e;
      } finally {
        if (version === this.loadVersion) requestAnimationFrame(() => this.hideLoading());
      }
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
