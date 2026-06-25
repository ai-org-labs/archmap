/**
 * Shared SVG assembly for 2D views.
 *
 * Every view produces the same diagram skeleton (zone/boundary boxes, edges,
 * nodes) and differs only in: which container boxes to draw, which elements to
 * emphasize vs. fade, and optional per-node badges. Keeping this in one place
 * means a new view is a small classifier, not a new renderer.
 */

import type { LayoutResult } from "../layout.js";
import type { ResolvedIcon } from "../icons.js";
import { iconDomId } from "../icons.js";
import {
  DEFAULT_STYLE,
  MARKERS,
  buildEdgePaths,
  edgeLabelSvg,
  edgePathFromD,
  escapeXml,
  nodeBadgeSvg,
  nodeSvg,
} from "./svg.js";

export interface Box {
  id: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramSpec {
  layout: LayoutResult;
  /** Suffix for the root class, e.g. "overview" -> archmap-view-overview. */
  viewClass: string;
  boxes?: Box[];
  /** Group/box class, e.g. "archmap-zone" or "archmap-boundary". */
  boxClass?: string;
  /**
   * When provided, nodes/edges in the set are emphasized and the rest faded.
   * Omit a channel to leave those elements at normal weight.
   */
  emphasizeNodes?: Set<string>;
  emphasizeEdges?: Set<string>;
  /** Node id -> short caption rendered beneath the node. */
  nodeBadges?: Map<string, string>;
  /** Node id -> resolved provider/kind icon (from the icon registry). */
  nodeIcons?: Map<string, ResolvedIcon>;
}

function channelClass(id: string, set: Set<string> | undefined): string {
  if (!set) return "";
  return set.has(id) ? " archmap-emphasis" : " archmap-faded";
}

export function renderDiagram(spec: DiagramSpec): string {
  const { layout, viewClass, boxes, boxClass = "archmap-zone", emphasizeNodes, emphasizeEdges, nodeBadges, nodeIcons } = spec;
  const boxLabelClass = boxClass === "archmap-boundary" ? "archmap-boundary-label" : "archmap-zone-label";
  const boxBoxClass = boxClass === "archmap-boundary" ? "archmap-boundary-box" : "archmap-zone-box";

  const boxesSvg = (boxes ?? [])
    .map(
      (b) =>
        `<g class="${boxClass}" data-id="${escapeXml(b.id)}">` +
        `<rect class="${boxBoxClass}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" ry="10" />` +
        `<text class="${boxLabelClass}" x="${b.x + 10}" y="${b.y + 18}">${escapeXml(b.label ?? b.id)}</text>` +
        `</g>`,
    )
    .join("");

  const edgePaths = buildEdgePaths(layout.edges);
  const edgesSvg = layout.edges
    .map((e) => {
      const emph = emphasizeEdges?.has(e.id) ?? false;
      const cls = `archmap-edge${channelClass(e.id, emphasizeEdges)}`;
      const path = edgePathFromD(edgePaths.get(e.id) ?? "", emph ? "archmap-arrow-emph" : "archmap-arrow");
      const label = e.label ? edgeLabelSvg(e.label, e.labelAt, e.labelOrient) : "";
      return `<g class="${cls}" data-id="${escapeXml(e.id)}">${path}${label}</g>`;
    })
    .join("");

  const nodesSvg = layout.nodes
    .map((n) => {
      const node = nodeSvg(n, channelClass(n.id, emphasizeNodes).trim(), nodeIcons?.get(n.id)?.key);
      const badge = nodeBadges?.get(n.id);
      return badge ? node + nodeBadgeSvg(n, badge) : node;
    })
    .join("");

  // Symbol defs for every distinct icon used (deduped by key).
  const iconDefs = nodeIcons
    ? [...new Map([...nodeIcons.values()].map((r) => [r.key, r])).values()]
        .map(
          (r) =>
            `<symbol id="${iconDomId(r.key)}" viewBox="${r.icon.viewBox}">${r.icon.body}</symbol>`,
        )
        .join("")
    : "";

  return (
    `<svg class="archmap archmap-view-${viewClass}" viewBox="0 0 ${layout.width.toFixed(0)} ${layout.height.toFixed(0)}" ` +
    `width="${layout.width.toFixed(0)}" height="${layout.height.toFixed(0)}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>${MARKERS}${iconDefs}</defs>` +
    `<style>${DEFAULT_STYLE}</style>` +
    `<g class="archmap-boxes">${boxesSvg}</g>` +
    `<g class="archmap-edges">${edgesSvg}</g>` +
    `<g class="archmap-nodes">${nodesSvg}</g>` +
    `</svg>`
  );
}
