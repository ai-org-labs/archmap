import {
  query,
  trace,
  type ArchMapModel,
  type GraphElementRef,
  type TraceOptions,
  type TraceResult,
} from "@archmap/core";

export interface LifecycleQueryOptions {
  ids?: string[];
  types?: string[];
  statuses?: string[];
  owners?: string[];
}

export interface LifecycleTraceOptions extends TraceOptions {
  types?: string[];
  statuses?: string[];
  owners?: string[];
}

function matchesLifecycle(element: GraphElementRef, options: LifecycleQueryOptions): boolean {
  if (options.statuses && !options.statuses.includes(String(element.value.status ?? ""))) return false;
  if (options.owners && !options.owners.includes(String(element.value.owner ?? ""))) return false;
  return true;
}

export function queryLifecycle(model: ArchMapModel, options: LifecycleQueryOptions = {}): GraphElementRef[] {
  return query(model, { ids: options.ids, types: options.types })
    .filter((element) => element.kind === "extension" && matchesLifecycle(element, options));
}

export function traceLifecycle(model: ArchMapModel, start: string, options: LifecycleTraceOptions = {}): TraceResult {
  const result = trace(model, start, options);
  const filtered = result.elements.filter((element) =>
    (!options.types || options.types.includes(element.type)) &&
    (element.kind !== "extension" || matchesLifecycle(element, options)),
  );
  const visible = new Set([start, ...filtered.map((element) => element.id)]);
  return {
    ...result,
    elements: filtered,
    paths: result.paths.filter((path) => path.elements.every((id) => visible.has(id))),
  };
}
