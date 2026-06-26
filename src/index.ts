/**
 * ArchMap public API (§27).
 *
 *   ArchMap.parse(source)         Text  -> Model
 *   ArchMap.render(model, opts)   Model -> SVG (a registered view)
 *   ArchMap.registerView(name, fn)
 *   ArchMap.initialize(opts)      scan the page and render in place
 */

import { ARCHMAP_VERSION } from "./types.js";

export * from "./types.js";
export type {
  LayoutResult,
  LayoutNode,
  LayoutZone,
  LayoutEdge,
  LayoutOptions,
} from "./layout.js";
export { computeLayout } from "./layout.js";
export { parse } from "./parser-entry.js";
export { toCanonicalModel } from "./canonical.js";
export {
  registerIcon,
  getIcon,
  listIcons,
  clearIcons,
  resolveIcon,
  resolveNodeIcons,
} from "./icons.js";
export type { RenderableIcon, ResolvedIcon } from "./icons.js";
export { extractArchMapBlocks } from "./parser/sections.js";
export {
  render,
  registerView,
  getView,
  listViews,
  initialize,
  defineArchMapViewerElement,
  parseOverlaysAttribute,
  viewerOptionsFromAttributes,
} from "./render.js";
export type {
  ViewRenderer,
  ViewContext,
  RenderOptions,
  RenderResult,
  InitializeOptions,
  ViewerAttributeOptions,
  ViewHandle,
  MountableView,
} from "./render.js";

export const version = ARCHMAP_VERSION;
