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
import { overviewView } from "./views/overview.js";
import { zoneView } from "./views/zone.js";
import { authView } from "./views/auth.js";
import { dataflowView } from "./views/dataflow.js";
import { boundaryView } from "./views/boundary.js";
import { validationView } from "./views/validation.js";

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
}

export interface RenderResult {
  view: string;
  layout: LayoutResult;
  model: ArchMapModel;
  /** Present for SVG (2D) views. */
  svg?: string;
  /** Present for mounted (3D) views when a target was supplied. */
  handle?: ViewHandle;
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

// Built-in views.
registerView("overview", overviewView);
registerView("zone", zoneView);
registerView("auth", authView);
registerView("dataflow", dataflowView);
registerView("boundary", boundaryView);
registerView("validation", validationView);

const OVERLAY_NAMES = new Set(["auth", "dataflow", "boundary", "permission", "validation"]);

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

/** Render a model into an SVG string, optionally injecting it into a target. */
export function render(model: ArchMapModel, options: RenderOptions = {}): RenderResult {
  const overlays = options.overlays ?? [];
  validateOverlays(model, overlays);
  const view = options.baseView ?? options.view ?? model.view?.default ?? "overview";
  const renderer = registry.get(view);
  if (!renderer) {
    model.warnings.push(diagnostic("unknown_base_view", `Unknown view "${view}". Registered views: ${listViews().join(", ") || "(none)"}.`, { type: "view", id: view }));
    syncDiagnostics(model);
    throw new Error(`Unknown view "${view}". Registered views: ${listViews().join(", ") || "(none)"}.`);
  }
  const rankBy = options.rankBy ?? VIEW_RANK_BY[view];
  const layout = computeLayout(model, { direction: options.direction, rankBy });
  const out = renderer({ model, layout, options });

  if (typeof out === "string") {
    const svg = decorateSvgWithOverlays(out, overlays.filter((overlay) => OVERLAY_NAMES.has(overlay)));
    syncDiagnostics(model);
    if (options.target && "innerHTML" in options.target) {
      options.target.innerHTML = svg;
    }
    return { view, layout, model, svg };
  }
  // Mountable (imperative) view.
  const handle = options.target ? out.mount(options.target) : undefined;
  syncDiagnostics(model);
  return { view, layout, model, handle };
}

export interface InitializeOptions {
  startOnLoad?: boolean;
  defaultView?: string;
  /** CSS selector for elements whose text content is ArchMap source. */
  selector?: string;
}

/**
 * Browser runtime: scan the page for ArchMap blocks and render them in place
 * (§5, §27). Supports both raw ```archmap fences inside an element and elements
 * whose text content is already an ArchMap document.
 */
export function initialize(options: InitializeOptions = {}): void {
  if (typeof document === "undefined") return;
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
