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
  LayoutTimings,
} from "./layout.js";
export { computeLayout, getLastLayoutTimings } from "./layout.js";
export {
  buildTimeDecoration,
  computePhasePresence,
  listTimelinePhases,
  resolvePhaseId,
} from "./time-projection.js";
export type { PhasePresence, PresenceInterval, TimeDecoration } from "./time-projection.js";
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
  createDiagramTags,
  injectDiagramTagsStyle,
  DEFAULT_DIAGRAM_TAG_ACTIONS,
  DEFAULT_DIAGRAM_TAG_OVERLAYS,
  DEFAULT_DIAGRAM_TAG_RENDER_MODES,
  DEFAULT_DIAGRAM_TAG_VIEWS,
} from "./controls/diagram-tags.js";
export type {
  DiagramTagAction,
  DiagramTagOption,
  DiagramTagsChangeEvent,
  DiagramTagsHandle,
  DiagramTagsOptions,
  DiagramTagsState,
  DiagramTagsTimelineOptions,
} from "./controls/diagram-tags.js";
export {
  maxAbstractionDepth,
  maxSubgraphDepth,
  maxZoneDepth,
  projectAbstraction,
  projectSubgraphAbstraction,
  projectZoneAbstraction,
} from "./subgraph-abstraction.js";
export type { AbstractionTarget, CollapsedAbstractions, ExpandedAbstractions } from "./subgraph-abstraction.js";
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
export {
  createArchMapStream,
} from "./stream.js";
export type {
  ArchMapStreamChunk,
  ArchMapStreamOptions,
  ArchMapStreamSession,
} from "./stream.js";
export {
  DEFAULT_ARCHMAP_SAMPLE_ID,
  DEFAULT_ARCHMAP_SAMPLES,
  getArchMapSample,
} from "./samples.js";
export type {
  ArchMapSample,
  ArchMapSampleBaseView,
  ArchMapSampleRecommendation,
  ArchMapSampleRenderMode,
} from "./samples.js";
export type {
  ViewRenderer,
  ViewContext,
  RenderOptions,
  RenderResult,
  RenderTimings,
  ExportPngOptions,
  InitializeOptions,
  ViewerAttributeOptions,
  ViewHandle,
  MountableView,
} from "./render.js";

export const version = ARCHMAP_VERSION;
