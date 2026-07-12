import type { LayoutResult } from "../layout.js";
import type { ArchMapModel } from "../types.js";

const ZONE_PALETTE = [
  { stroke: "#4f7fc8", fill: "#eef5ff", text: "#244b86" },
  { stroke: "#d17732", fill: "#fff4e8", text: "#7a3f12" },
  { stroke: "#3b946f", fill: "#edf8f3", text: "#1f5c43" },
  { stroke: "#8b6fc7", fill: "#f5f0ff", text: "#5a3e92" },
  { stroke: "#3b9da0", fill: "#ecfbfb", text: "#1e6668" },
  { stroke: "#c45f87", fill: "#fff0f6", text: "#823456" },
  { stroke: "#9b7a2c", fill: "#fff8df", text: "#604813" },
  { stroke: "#5d7c8f", fill: "#eef6fa", text: "#365568" },
];

function zoneOf(model: ArchMapModel): Map<string, string> {
  const zones = new Set(model.zones.map((zone) => zone.id));
  const map = new Map<string, string>();
  for (const node of model.nodes) {
    const zone = node.resolvedZone === "unknown" ? undefined : node.resolvedZone ?? node.zone;
    if (zone && zones.has(zone)) map.set(node.id, zone);
  }
  return map;
}

function paletteForZones(model: ArchMapModel): Map<string, (typeof ZONE_PALETTE)[number]> {
  return new Map(model.zones.map((zone, index) => [zone.id, ZONE_PALETTE[index % ZONE_PALETTE.length]]));
}

function translucent(hex: string, alpha = 0.3): string {
  const value = hex.replace(/^#/, "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

export function overviewZoneColorStyles(model: ArchMapModel, layout: LayoutResult): {
  nodeStyles: Map<string, string>;
  edgeStyles: Map<string, string>;
  boxStyles: Map<string, string>;
} {
  const nodeZone = zoneOf(model);
  const zonePalette = paletteForZones(model);
  const nodeStyles = new Map<string, string>();
  const edgeStyles = new Map<string, string>();
  const boxStyles = new Map<string, string>();

  for (const node of layout.nodes) {
    const zone = nodeZone.get(node.id);
    const color = zone ? zonePalette.get(zone) : undefined;
    if (!color) continue;
    nodeStyles.set(node.id, [
      `--archmap-node-fill:${color.fill}`,
      `--archmap-node-stroke:${color.stroke}`,
      `--archmap-node-label:${color.text}`,
    ].join(";"));
  }

  for (const edge of layout.edges) {
    const zone = nodeZone.get(edge.from);
    const color = zone ? zonePalette.get(zone) : undefined;
    if (!color) continue;
    edgeStyles.set(edge.id, [
      `--archmap-edge-stroke:${color.stroke}`,
      `--archmap-edge-label:${color.text}`,
    ].join(";"));
  }

  for (const zone of layout.zones) {
    const color = zonePalette.get(zone.id);
    if (!color) continue;
    boxStyles.set(zone.id, [
      `--archmap-zone-fill:${translucent(color.fill)}`,
      `--archmap-zone-stroke:${color.stroke}`,
      `--archmap-zone-label:${color.text}`,
    ].join(";"));
  }

  return { nodeStyles, edgeStyles, boxStyles };
}
