import type { ArchMapModel, ExtensionElement, ExtensionRelation } from "@archmap/core";

export interface LifecycleJson {
  elements: ExtensionElement[];
  relations: ExtensionRelation[];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

export function lifecycleJson(model: ArchMapModel): LifecycleJson {
  return {
    elements: [...(model.extensions?.elements ?? [])].sort((left, right) =>
      compareText(`${left.elementType ?? left.type}\u0000${left.id}`, `${right.elementType ?? right.type}\u0000${right.id}`),
    ),
    relations: [...(model.extensions?.relations ?? [])].sort((left, right) =>
      compareText(
        `${left.from}\u0000${left.type}\u0000${left.to}\u0000${left.id}`,
        `${right.from}\u0000${right.type}\u0000${right.to}\u0000${right.id}`,
      ),
    ),
  };
}

export function serializeLifecycle(model: ArchMapModel, space = 2): string {
  return JSON.stringify(lifecycleJson(model), null, space);
}
