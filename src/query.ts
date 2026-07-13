import type { ArchMapModel, ExtensionRelation } from "./types.js";

export type GraphElementKind = "node" | "edge" | "zone" | "boundary" | "identity" | "permission" | "data" | "scenario" | "extension";

export interface GraphElementRef {
  id: string;
  kind: GraphElementKind;
  type: string;
  value: Record<string, unknown>;
}

export interface QueryOptions {
  ids?: string[];
  types?: string[];
}

export interface TraceOptions {
  direction?: "forward" | "reverse" | "both";
  relationTypes?: string[];
  maxDepth?: number;
}

export interface TracePath {
  elements: string[];
  relations: string[];
}

export interface TraceResult {
  start: string;
  elements: GraphElementRef[];
  paths: TracePath[];
}

function record(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export function graphElements(model: ArchMapModel): GraphElementRef[] {
  const result: GraphElementRef[] = [];
  const add = (values: Array<{ id: string }>, kind: Exclude<GraphElementKind, "extension">): void => {
    for (const value of values) result.push({ id: value.id, kind, type: kind, value: record(value) });
  };
  add(model.nodes, "node");
  add(model.edges, "edge");
  add(model.zones, "zone");
  add(model.boundaries, "boundary");
  add(model.identities, "identity");
  add(model.permissions, "permission");
  add(model.data, "data");
  add(model.scenarios, "scenario");
  for (const value of model.extensions?.elements ?? []) {
    result.push({
      id: value.id,
      kind: "extension",
      type: value.elementType ?? value.type ?? "extension",
      value: record(value),
    });
  }
  return result.sort((left, right) => `${left.type}\0${left.id}`.localeCompare(`${right.type}\0${right.id}`, "en"));
}

export function query(model: ArchMapModel, options: QueryOptions = {}): GraphElementRef[] {
  const ids = options.ids ? new Set(options.ids) : undefined;
  const types = options.types ? new Set(options.types) : undefined;
  return graphElements(model).filter((element) =>
    (!ids || ids.has(element.id)) && (!types || types.has(element.type)),
  );
}

interface TraversableRelation {
  id: string;
  type: string;
  from: string;
  to: string;
}

function relations(model: ArchMapModel): TraversableRelation[] {
  const extension = (model.extensions?.relations ?? []).map((relation: ExtensionRelation) => ({
    id: relation.id, type: relation.type, from: relation.from, to: relation.to,
  }));
  const architecture = model.edges.map((edge) => ({
    id: edge.id, type: edge.flow ?? "edge", from: edge.from, to: edge.to,
  }));
  return [...extension, ...architecture].sort((left, right) =>
    `${left.type}\0${left.from}\0${left.to}\0${left.id}`.localeCompare(`${right.type}\0${right.from}\0${right.to}\0${right.id}`, "en"),
  );
}

export function trace(model: ArchMapModel, start: string, options: TraceOptions = {}): TraceResult {
  const direction = options.direction ?? "forward";
  const maxDepth = Math.max(0, options.maxDepth ?? Number.POSITIVE_INFINITY);
  const allowedRelations = options.relationTypes ? new Set(options.relationTypes) : undefined;
  const allElements = new Map(graphElements(model).map((element) => [element.id, element]));
  if (!allElements.has(start)) return { start, elements: [], paths: [] };
  const allRelations = relations(model).filter((relation) => !allowedRelations || allowedRelations.has(relation.type));
  const paths: TracePath[] = [{ elements: [start], relations: [] }];
  const queue = [paths[0]];
  const seenPaths = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift() as TracePath;
    if (path.relations.length >= maxDepth) continue;
    const current = path.elements[path.elements.length - 1];
    const next = allRelations.flatMap((relation) => {
      const candidates: Array<{ id: string; relation: TraversableRelation }> = [];
      if ((direction === "forward" || direction === "both") && relation.from === current) candidates.push({ id: relation.to, relation });
      if ((direction === "reverse" || direction === "both") && relation.to === current) candidates.push({ id: relation.from, relation });
      return candidates;
    }).filter((candidate) => allElements.has(candidate.id) && !path.elements.includes(candidate.id));
    for (const candidate of next) {
      const nextPath = {
        elements: [...path.elements, candidate.id],
        relations: [...path.relations, candidate.relation.id],
      };
      const key = `${nextPath.elements.join("\0")}\x01${nextPath.relations.join("\0")}`;
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      paths.push(nextPath);
      queue.push(nextPath);
    }
  }
  const reached = new Set(paths.flatMap((path) => path.elements));
  return {
    start,
    elements: [...reached].map((id) => allElements.get(id) as GraphElementRef)
      .sort((left, right) => `${left.type}\0${left.id}`.localeCompare(`${right.type}\0${right.id}`, "en")),
    paths,
  };
}
