/** Small, standalone diagram API. The legacy engine remains at @archmap/core. */
export * from "./types.js";
export { parseDiagram } from "./parser.js";
export { computeDiagramLayout } from "./layout.js";
export { renderDiagram } from "./render.js";
export { DIAGRAM_SAMPLES } from "./samples.js";
export { registerIcon, getIcon, listIcons } from "../icons.js";
