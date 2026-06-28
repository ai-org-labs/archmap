import type { LayoutResult } from "../layout.js";
import type { Box } from "./base.js";

const STACK_ZONE_GAP = 28;
const STACK_ZONE_MARGIN = 20;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function stackScore(candidate: Box, original: Box, layout: LayoutResult): number {
  const dx = candidate.x - original.x;
  const dy = candidate.y - original.y;
  const overflowX = Math.max(0, candidate.x + candidate.w + STACK_ZONE_MARGIN - layout.width);
  const overflowY = Math.max(0, candidate.y + candidate.h + STACK_ZONE_MARGIN - layout.height);
  return dx * dx + dy * dy * 1.35 + overflowX * overflowX * 2 + overflowY * overflowY * 1.4;
}

/**
 * Stack view treats zones as additive block annotations rather than enclosing
 * containers. Keep each zone close to its natural member bounds, but move it to
 * the right or below when it would overlap another zone block.
 */
export function stackZoneBoxes(layout: LayoutResult): Box[] {
  const placed: Box[] = [];
  const source = [...layout.zones].sort((a, b) =>
    (a.depth ?? 0) - (b.depth ?? 0) ||
    a.z - b.z ||
    a.y - b.y ||
    a.x - b.x ||
    a.id.localeCompare(b.id),
  );

  for (const zone of source) {
    const original: Box = {
      id: zone.id,
      label: zone.label,
      depth: zone.depth,
      x: Math.max(STACK_ZONE_MARGIN, zone.x),
      y: Math.max(STACK_ZONE_MARGIN, zone.y),
      w: zone.w,
      h: zone.h,
    };
    let best: Box | undefined;
    for (let row = 0; row <= placed.length + 1; row++) {
      for (let col = 0; col <= placed.length + 1; col++) {
        const candidate = {
          ...original,
          x: original.x + col * (original.w + STACK_ZONE_GAP),
          y: original.y + row * (original.h + STACK_ZONE_GAP),
        };
        if (placed.some((box) => overlaps(candidate, box))) continue;
        if (!best || stackScore(candidate, original, layout) < stackScore(best, original, layout)) {
          best = candidate;
        }
      }
    }
    placed.push(best ?? original);
  }
  return placed;
}
