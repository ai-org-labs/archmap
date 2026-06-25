/**
 * The Text -> Model entry point, in its own module so both `index.ts` and the
 * render runtime can import it without a circular dependency.
 */

import { parseGraph } from "./parser/graph.js";
import { buildModel } from "./parser/metadata.js";
import { splitSections } from "./parser/sections.js";
import { validate } from "./validate.js";
import type { ArchMapModel } from "./types.js";

/**
 * Parse an ArchMap document (graph section + optional YAML metadata) into the
 * normalized model, with validation diagnostics attached.
 */
export function parse(source: string): ArchMapModel {
  const { graph, metadata } = splitSections(source);
  const graphResult = parseGraph(graph);
  const model = buildModel(graphResult, metadata);
  return validate(model);
}
