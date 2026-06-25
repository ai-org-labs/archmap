/**
 * Render layer: view registry + the `render` / `initialize` API (§27).
 *
 * A view is a pure function from (model, layout) to an SVG string. This keeps
 * views testable headlessly and lets a future three.js view register the same
 * way and consume the same LayoutResult (with `z`).
 */

import { computeLayout } from "./layout.js";
import type { LayoutOptions, LayoutResult } from "./layout.js";
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

/** A view's preferred flow-axis ranking, unless the caller overrides it. */
const VIEW_RANK_BY: Record<string, LayoutOptions["rankBy"]> = {
  zone: "zone",
};

/** Render a model into an SVG string, optionally injecting it into a target. */
export function render(model: ArchMapModel, options: RenderOptions = {}): RenderResult {
  const view = options.view ?? model.view?.default ?? "overview";
  const renderer = registry.get(view);
  if (!renderer) {
    throw new Error(`Unknown view "${view}". Registered views: ${listViews().join(", ") || "(none)"}.`);
  }
  const rankBy = options.rankBy ?? VIEW_RANK_BY[view];
  const layout = computeLayout(model, { direction: options.direction, rankBy });
  const out = renderer({ model, layout, options });

  if (typeof out === "string") {
    if (options.target && "innerHTML" in options.target) {
      options.target.innerHTML = out;
    }
    return { view, layout, model, svg: out };
  }
  // Mountable (imperative) view.
  const handle = options.target ? out.mount(options.target) : undefined;
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
