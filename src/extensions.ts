import yaml from "js-yaml";
import { diagnostic } from "./diagnostics.js";
import type { ElementTypeDefinition, RelationTypeDefinition } from "./plugin.js";
import type {
  ArchMapModel,
  Diagnostic,
  ExtensionElement,
  ExtensionRelation,
} from "./types.js";

type Dict = Record<string, unknown>;

const CORE_METADATA_SECTIONS = new Set([
  "title", "description", "mode", "profile", "architecture",
  "nodes", "edges", "zones", "boundaries", "identities", "permissions",
  "data", "scenarios", "timeline", "runtime", "layout", "view",
]);

function isObject(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRegisteredExtensions(
  model: ArchMapModel,
  elementTypes: Iterable<ElementTypeDefinition>,
  relationTypes: Iterable<RelationTypeDefinition>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const definitions = new Map([...elementTypes].map((definition) => [definition.name, definition]));
  const relationDefinitions = new Map([...relationTypes].map((definition) => [definition.name, definition]));
  const ids = architectureKinds(model);
  for (const element of model.extensions?.elements ?? []) {
    if (ids.has(element.id)) {
      diagnostics.push(diagnostic("extension_duplicate_id", `Extension element "${element.id}" duplicates another graph element.`, { type: "extension", id: element.id }, "error"));
    }
    const elementType = element.elementType ?? element.type ?? "extension";
    ids.set(element.id, elementType);
    const definition = definitions.get(elementType);
    for (const field of definition?.required ?? []) {
      if (element[field] === undefined || element[field] === null || element[field] === "") {
        diagnostics.push(diagnostic("extension_schema_mismatch", `${elementType} "${element.id}" requires field "${field}".`, { type: "extension", id: element.id }, "error"));
      }
    }
  }

  const acyclic = new Map<string, Map<string, string[]>>();
  for (const relation of model.extensions?.relations ?? []) {
    const definition = relationDefinitions.get(relation.type);
    if (!definition) diagnostics.push(diagnostic("extension_invalid_relation", `Relation "${relation.id}" uses unregistered type "${relation.type}".`, { type: "extension", id: relation.id }, "error"));
    if (!ids.has(relation.from)) diagnostics.push(diagnostic("extension_missing_reference", `Relation "${relation.id}" references unknown source "${relation.from}".`, { type: "extension", id: relation.id }, "error"));
    if (!ids.has(relation.to)) diagnostics.push(diagnostic("extension_missing_reference", `Relation "${relation.id}" references unknown target "${relation.to}".`, { type: "extension", id: relation.id }, "error"));
    if (relation.from === relation.to && definition?.allowSelf !== true) diagnostics.push(diagnostic("extension_self_dependency", `Relation "${relation.id}" connects "${relation.from}" to itself.`, { type: "extension", id: relation.id }, "error"));
    if (definition?.acyclic) {
      const graph = acyclic.get(relation.type) ?? new Map<string, string[]>();
      graph.set(relation.from, [...(graph.get(relation.from) ?? []), relation.to]);
      acyclic.set(relation.type, graph);
    }
  }
  for (const [type, graph] of acyclic) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const cyclic = (graph.get(id) ?? []).some(visit);
      visiting.delete(id);
      visited.add(id);
      return cyclic;
    };
    for (const id of graph.keys()) {
      if (visit(id)) {
        diagnostics.push(diagnostic("extension_relation_cycle", `Relation type "${type}" contains a cycle at "${id}".`, { type: "extension", id }, "error"));
        break;
      }
    }
  }
  return diagnostics;
}

function parseMetadata(metadata: string | undefined): Dict {
  if (!metadata?.trim()) return {};
  try {
    const loaded = yaml.load(metadata);
    return isObject(loaded) ? loaded : {};
  } catch {
    return {};
  }
}

function architectureKinds(model: ArchMapModel): Map<string, string> {
  const kinds = new Map<string, string>();
  const add = (items: Array<{ id: string }>, kind: string): void => {
    for (const item of items) if (!kinds.has(item.id)) kinds.set(item.id, kind);
  };
  add(model.nodes, "node");
  add(model.edges, "edge");
  add(model.zones, "zone");
  add(model.boundaries, "boundary");
  add(model.identities, "identity");
  add(model.permissions, "permission");
  add(model.data, "data");
  add(model.scenarios, "scenario");
  return kinds;
}

export function normalizeRegisteredExtensions(
  model: ArchMapModel,
  elementTypes: Iterable<ElementTypeDefinition>,
  relationTypes: Iterable<RelationTypeDefinition>,
): void {
  const metadata = parseMetadata(model.source?.metadata);
  const definitions = [...elementTypes]
    .filter((definition) => definition.section && definition.section !== "relations")
    .sort((left, right) => `${left.section}:${left.name}`.localeCompare(`${right.section}:${right.name}`));
  const knownPluginSections = new Set(definitions.map((definition) => definition.section as string));
  const registeredRelations = new Set([...relationTypes].map((definition) => definition.name));
  if (registeredRelations.size > 0) knownPluginSections.add("relations");

  const elements: ExtensionElement[] = [];
  for (const definition of definitions) {
    const section = definition.section as string;
    const records = metadata[section];
    if (!isObject(records)) continue;
    for (const [id, value] of Object.entries(records).sort(([left], [right]) => left.localeCompare(right))) {
      if (!isObject(value)) continue;
      elements.push({
        ...value,
        id,
        elementType: definition.name,
        title: typeof value.title === "string" ? value.title : undefined,
        provenance: { section, id },
      });
    }
  }

  const endpointKinds = architectureKinds(model);
  for (const element of elements) endpointKinds.set(element.id, element.elementType ?? element.type ?? "extension");
  const relations: ExtensionRelation[] = [];
  const rawRelations = metadata.relations;
  if (registeredRelations.size > 0 && Array.isArray(rawRelations)) {
    const generatedCounts = new Map<string, number>();
    for (const [index, value] of rawRelations.entries()) {
      if (!isObject(value)) continue;
      const from = typeof value.from === "string" ? value.from : undefined;
      const to = typeof value.to === "string" ? value.to : undefined;
      const type = typeof value.type === "string" ? value.type : undefined;
      if (!from || !to || !type) continue;
      const base = `${from}__${type}__${to}`;
      const occurrence = generatedCounts.get(base) ?? 0;
      generatedCounts.set(base, occurrence + 1);
      relations.push({
        ...value,
        id: typeof value.id === "string" ? value.id : `${base}__${occurrence}`,
        type,
        from,
        to,
        fromKind: endpointKinds.get(from) ?? "unknown",
        toKind: endpointKinds.get(to) ?? "unknown",
        registeredType: registeredRelations.has(type),
        provenance: { section: "relations", index },
      });
    }
    relations.sort((left, right) => left.id.localeCompare(right.id));
  }

  const sections: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right))) {
    if (CORE_METADATA_SECTIONS.has(section) || knownPluginSections.has(section)) continue;
    sections[section] = value;
    model.warnings.push(diagnostic(
      "plugin_required",
      `Metadata section "${section}" requires a plugin or registered element type.`,
      { type: "extension", id: section },
    ));
  }

  model.extensions = {
    elements,
    relations,
    ...(Object.keys(sections).length > 0 ? { sections } : {}),
  };
}
