import type { DiagramGroup, DiagramModel } from './types.js';

/** Ancestors include the group itself; bounded even for externally constructed cyclic models. */
export function groupAncestors(model: DiagramModel, id?: string): string[] {
  const result: string[] = [];
  while (id && !result.includes(id)) {
    const group = model.groups.find(item => item.id === id);
    if (!group) break;
    result.push(id); id = group.parent;
  }
  return result;
}
export function groupContains(model: DiagramModel, ancestor: string, descendant?: string): boolean {
  return groupAncestors(model, descendant).includes(ancestor);
}
export function orderedGroups(model: DiagramModel): DiagramGroup[] {
  const result: DiagramGroup[] = [], seen = new Set<string>();
  function visit(group: DiagramGroup) {
    if (seen.has(group.id)) return;
    seen.add(group.id); result.push(group);
    model.groups.filter(child => child.parent === group.id).forEach(visit);
  }
  model.groups.filter(group => !group.parent).forEach(visit);
  model.groups.forEach(visit);
  return result;
}
