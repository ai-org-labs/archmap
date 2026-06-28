/**
 * Icon registry — the *mechanism* only. The core ships no icon assets; callers
 * register packs (see src/packs/cloud-icons.ts for a sample). This keeps the
 * core dependency-free and clear of vendor-logo licensing.
 *
 * Icons are stored as inline SVG so diagrams stay self-contained (no network),
 * which also lets a future three.js view rasterize them into textures.
 *
 * Resolution for a node is by, in order: `provider/kind`, `provider`, `kind`.
 */

import type { ArchMapModel } from "./types.js";

export interface RenderableIcon {
  /** viewBox of the inline SVG, e.g. "0 0 24 24". */
  viewBox: string;
  /** Inner SVG markup, e.g. `<path fill="#..." d="..." />`. */
  body: string;
}

export interface ResolvedIcon {
  key: string;
  icon: RenderableIcon;
}

const registry = new Map<string, RenderableIcon>();

/** Register an icon under a key such as "aws", "gcp", or "aws/relational_database". */
export function registerIcon(key: string, icon: RenderableIcon): void {
  registry.set(key, icon);
}

export function getIcon(key: string): RenderableIcon | undefined {
  return registry.get(key);
}

export function listIcons(): string[] {
  return [...registry.keys()];
}

export function clearIcons(): void {
  registry.clear();
}

/** Resolve the best icon for a (provider, kind) pair, most specific first. */
export function resolveIcon(provider?: string, kind?: string): ResolvedIcon | undefined {
  const candidates: string[] = [];
  if (provider && kind) candidates.push(`${provider}/${kind}`);
  if (provider) candidates.push(provider);
  if (kind) candidates.push(kind);
  for (const key of candidates) {
    const icon = registry.get(key);
    if (icon) return { key, icon };
  }
  return undefined;
}

/** Map of node id -> resolved icon(s) for every node that has one. */
export function resolveNodeIcons(model: ArchMapModel): Map<string, ResolvedIcon | ResolvedIcon[]> {
  const map = new Map<string, ResolvedIcon | ResolvedIcon[]>();
  for (const n of model.nodes) {
    const memberIconRefs = n.abstraction?.memberIconRefs ?? [];
    if (memberIconRefs.length > 0) {
      const icons = memberIconRefs
        .map((ref) => resolveIcon(ref.provider, ref.kind))
        .filter((entry): entry is ResolvedIcon => !!entry);
      if (icons.length > 0) {
        map.set(n.id, icons);
        continue;
      }
    }
    const r = resolveIcon(n.provider, n.kind);
    if (r) map.set(n.id, r);
  }
  return map;
}

/** A DOM-id-safe form of an icon key, for `<symbol id>` / `<use href>`. */
export function iconDomId(key: string): string {
  return "archmap-icon-" + key.replace(/[^a-zA-Z0-9_-]/g, "-");
}
