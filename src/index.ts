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
export { reportDiagnosticsToConsole } from "./diagnostics.js";
export type { ConsoleReportOptions } from "./diagnostics.js";
export {
  inspectModelElement,
  inspectorHtml,
  renderInspector,
} from "./inspector.js";
export type {
  InspectableKind,
  InspectorDetails,
  InspectorField,
  InspectorSelection,
} from "./inspector.js";
export { attachPanZoom, computeFitTransform, isInteractiveTarget } from "./views/interaction.js";
export type { PanZoomHandle, PanZoomTransform } from "./views/interaction.js";
export {
  maxAbstractionDepth,
  maxSubgraphDepth,
  maxZoneDepth,
  projectAbstraction,
  projectSubgraphAbstraction,
  projectZoneAbstraction,
} from "./subgraph-abstraction.js";
export type { AbstractionTarget } from "./subgraph-abstraction.js";
export { extractArchMapBlocks } from "./parser/sections.js";
export {
  render,
  registerView,
  getView,
  listViews,
  initialize,
  defineArchMapViewerElement,
  BASE_VIEWS,
  RENDER_MODES,
  diagnosticsHtml,
  fetchArchMapSource,
  parseOverlaysAttribute,
  renderDiagnostics,
  viewerOptionsFromAttributes,
} from "./render.js";
export {
  validateRenderedSvgPorts,
} from "./render-validation.js";
export type {
  RenderValidationFailure,
  RenderValidationOptions,
} from "./render-validation.js";
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
