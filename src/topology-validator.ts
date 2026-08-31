import type { ArchMapInstance } from "./plugin.js";
import type { DerivedTopologyAnalysis } from "./topology-analysis.js";
import { analyzeTopology } from "./topology-analysis.js";
import type { TopologyModel } from "./topology.js";
import type { Diagnostic } from "./types.js";

/** One explicitly authored or observed Resource path for a canonical Edge. */
export interface TopologyPath {
  edgeId: string;
  /** Ordered Resource IDs, including the canonical Edge endpoints. */
  resourceIds: readonly string[];
}

/**
 * Optional path evidence supplied by an importer, scenario, or caller.
 *
 * Core never synthesizes intermediate Resources. In particular, validators
 * checking `enforcedBy` must treat a missing path as unknown, not as proof
 * that an enforcement Resource was traversed.
 */
export interface TopologyPathContext {
  paths: readonly TopologyPath[];
  pathForEdge(edgeId: string): readonly string[] | undefined;
}

export interface TopologyValidationOptions {
  /** Explicit communication paths only; omitted means no path evidence. */
  paths?: readonly TopologyPath[];
}

export interface TopologyValidatorContext {
  instance: ArchMapInstance;
  topology: TopologyModel;
  analysis: DerivedTopologyAnalysis;
  pathContext?: TopologyPathContext;
}

export interface TopologyValidatorDefinition {
  name: string;
  validate(context: TopologyValidatorContext): void | Diagnostic[];
}

export interface TopologyValidationResult {
  topology: TopologyModel;
  analysis: DerivedTopologyAnalysis;
  diagnostics: Diagnostic[];
}

export function createTopologyPathContext(paths: readonly TopologyPath[]): TopologyPathContext {
  const copies = paths.map((path) => ({
    edgeId: path.edgeId,
    resourceIds: [...path.resourceIds],
  }));
  const byEdge = new Map(copies.map((path) => [path.edgeId, path.resourceIds]));
  return {
    paths: copies,
    pathForEdge: (edgeId) => byEdge.get(edgeId),
  };
}

export function runTopologyValidators(
  instance: ArchMapInstance,
  validators: Iterable<TopologyValidatorDefinition>,
  topology: TopologyModel,
  options: TopologyValidationOptions = {},
  analysis = analyzeTopology(topology),
): TopologyValidationResult {
  const pathContext = options.paths === undefined
    ? undefined
    : createTopologyPathContext(options.paths);
  const diagnostics: Diagnostic[] = [];
  const context: TopologyValidatorContext = {
    instance,
    topology,
    analysis,
    ...(pathContext ? { pathContext } : {}),
  };
  for (const validator of validators) {
    diagnostics.push(...(validator.validate(context) ?? []));
  }
  return { topology, analysis, diagnostics };
}
