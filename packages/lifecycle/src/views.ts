import {
  query,
  type ArchMapModel,
  type DiagramTagOption,
  type GraphElementRef,
  type ViewDefinition,
} from "@archmap/core";
import { traceLifecycle, type LifecycleTraceOptions } from "./query.js";

export interface LifecycleViewOptions extends LifecycleTraceOptions {
  start?: string;
  now?: Date | string | number;
}

interface PositionedElement extends GraphElementRef {
  x: number;
  y: number;
  width: number;
  height: number;
  titleLines: string[];
  showId: boolean;
  rows: string[];
}

interface Projection {
  title: string;
  description: string;
  elements: GraphElementRef[];
  relations: Array<{ id: string; type: string; from: string; to: string }>;
  columns: string[][];
  options?: LifecycleViewOptions;
}

const CARD_WIDTH = 240;
const GAP_X = 86;
const GAP_Y = 36;
const PAD_X = 34;
const PAD_TOP = 92;

const TYPE_LABELS: Record<string, string> = {
  requirement: "Requirement",
  acceptanceCriterion: "Acceptance criterion",
  test: "Test",
  evidence: "Evidence",
  decision: "Decision",
  risk: "Risk",
  node: "Architecture component",
  edge: "Architecture connection",
  zone: "Architecture zone",
  boundary: "Architecture boundary",
};

const RELATION_LABELS: Record<string, string> = {
  accepted_by: "accepted when",
  implemented_by: "implemented by",
  realized_by: "fulfilled by",
  allocated_to: "allocated to",
  verified_by: "verified by",
  evidenced_by: "proved by",
  decomposes: "decomposes into",
  refines: "refines",
  depends_on: "depends on",
};

const COLORS: Record<string, { fill: string; stroke: string }> = {
  requirement: { fill: "#eaf4fb", stroke: "#4386a8" },
  acceptanceCriterion: { fill: "#e8f7f4", stroke: "#3a9487" },
  test: { fill: "#fff0f3", stroke: "#bd5c72" },
  evidence: { fill: "#f2ecfb", stroke: "#8063aa" },
  decision: { fill: "#fff6df", stroke: "#a77a24" },
  risk: { fill: "#fff0ea", stroke: "#ba6845" },
  node: { fill: "#fff7e7", stroke: "#b2812d" },
};

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function unique(elements: GraphElementRef[]): GraphElementRef[] {
  return [...new Map(elements.map((element) => [element.id, element])).values()]
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function relationsFor(model: ArchMapModel, ids: Set<string>): Projection["relations"] {
  const relations = (model.extensions?.relations ?? [])
    .filter((relation) => ids.has(relation.from) && ids.has(relation.to))
    .map((relation) => ({ id: relation.id, type: relation.type, from: relation.from, to: relation.to }))
  const existing = new Set(relations.map((relation) => `${relation.from}\0${relation.type}\0${relation.to}`));
  for (const element of model.extensions?.elements ?? []) {
    const links = element.elementType === "acceptanceCriterion" && typeof element.requirement === "string"
      ? [{ type: "accepted_by", from: element.requirement, to: element.id }]
      : element.elementType === "evidence" && typeof element.producedBy === "string"
        ? [{ type: "evidenced_by", from: element.producedBy, to: element.id }]
        : [];
    for (const link of links) {
      const key = `${link.from}\0${link.type}\0${link.to}`;
      if (!ids.has(link.from) || !ids.has(link.to) || existing.has(key)) continue;
      relations.push({ id: `inferred:${link.type}:${link.from}:${link.to}`, ...link });
      existing.add(key);
    }
  }
  return relations.sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function lifecycleOptions(value: unknown): LifecycleViewOptions {
  if (!value || typeof value !== "object") return {};
  return value as LifecycleViewOptions;
}

export function requirementsProjection(model: ArchMapModel): Projection {
  const requirements = query(model, { types: ["requirement"] });
  const acceptance = query(model, { types: ["acceptanceCriterion"] });
  const lifecycleIds = new Set([...requirements, ...acceptance].map((element) => element.id));
  const architectureIds = new Set((model.extensions?.relations ?? [])
    .filter((relation) => lifecycleIds.has(relation.from) && ["implemented_by", "realized_by", "allocated_to"].includes(relation.type))
    .map((relation) => relation.to));
  const architecture = query(model, { ids: [...architectureIds] }).filter((element) => element.kind !== "extension");
  const elements = unique([...requirements, ...acceptance, ...architecture]);
  return {
    title: "Requirements",
    description: "Read left to right: requirement → acceptance condition → implementing architecture.",
    elements,
    relations: relationsFor(model, new Set(elements.map((element) => element.id))),
    columns: [["requirement"], ["acceptanceCriterion"], ["node", "edge", "zone", "boundary", "identity", "permission", "data"]],
  };
}

export function traceabilityProjection(model: ArchMapModel, options: LifecycleViewOptions = {}): Projection {
  const start = options.start ?? query(model, { types: ["requirement"] })[0]?.id;
  const result = start ? traceLifecycle(model, start, options) : { elements: [], paths: [], start: "" };
  const candidates = unique(result.elements);
  const candidateRelations = relationsFor(model, new Set(candidates.map((element) => element.id)));
  const connected = new Set([start, ...candidateRelations.flatMap((relation) => [relation.from, relation.to])]);
  const elements = candidates.filter((element) => connected.has(element.id));
  return {
    title: "Traceability",
    description: "Follow the selected requirement through acceptance, architecture, tests, and evidence.",
    elements,
    relations: candidateRelations.filter((relation) => connected.has(relation.from) && connected.has(relation.to)),
    columns: [["requirement", "decision", "risk"], ["acceptanceCriterion"], ["node", "edge", "zone", "boundary", "identity", "permission", "data"], ["test"], ["evidence"]],
    options,
  };
}

export function qualityProjection(model: ArchMapModel, options: LifecycleViewOptions = {}): Projection {
  const elements = unique(query(model, { types: ["requirement", "acceptanceCriterion", "test", "evidence"] }));
  return {
    title: "Quality",
    description: "Each row is a quality chain: requirement → acceptance condition → test → evidence.",
    elements,
    relations: relationsFor(model, new Set(elements.map((element) => element.id))),
    columns: [["requirement"], ["acceptanceCriterion"], ["test"], ["evidence"]],
    options,
  };
}

function freshness(element: GraphElementRef, options?: LifecycleViewOptions): string | undefined {
  if (element.type !== "evidence") return undefined;
  if (typeof element.value.freshness === "string") return element.value.freshness;
  const expiresAt = element.value.expiresAt;
  if (typeof expiresAt !== "string" && !(expiresAt instanceof Date)) return "freshness unknown";
  const now = options?.now ? new Date(options.now).getTime() : Date.now();
  return new Date(expiresAt).getTime() < now ? "expired" : "fresh";
}

function metadata(element: GraphElementRef, options?: LifecycleViewOptions): string[] {
  const values = element.value;
  const rows = [
    typeof values.status === "string" ? `status: ${values.status}` : undefined,
    typeof values.priority === "string" ? `priority: ${values.priority}` : undefined,
    typeof values.owner === "string" ? `owner: ${values.owner}` : undefined,
    typeof values.result === "string" ? `result: ${values.result}` : undefined,
    freshness(element, options),
  ];
  return rows.filter((value): value is string => Boolean(value)).slice(0, 3);
}

function displayTitle(element: GraphElementRef): string {
  const value = element.value;
  return String(value.title ?? value.label ?? value.statement ?? element.id);
}

function wrapText(value: string, maxCharacters = 30, maxLines = 3): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, Math.max(1, maxCharacters - 1))}…`;
  return visible;
}

function position(projection: Projection): PositionedElement[] {
  const columnByType = new Map<string, number>();
  projection.columns.forEach((types, index) => types.forEach((type) => columnByType.set(type, index)));
  const grouped = projection.columns.map(() => [] as GraphElementRef[]);
  for (const element of projection.elements) grouped[columnByType.get(element.type) ?? 0].push(element);
  return grouped.flatMap((elements, column) => {
    let y = PAD_TOP;
    return elements.map((element) => {
      const title = displayTitle(element);
      const titleLines = wrapText(title);
      const showId = title !== element.id;
      const rows = metadata(element, projection.options);
      const height = Math.max(118, 64 + titleLines.length * 18 + (showId ? 16 : 0) + rows.length * 14 + 10);
      const positioned = {
        ...element,
        x: PAD_X + column * (CARD_WIDTH + GAP_X),
        y,
        width: CARD_WIDTH,
        height,
        titleLines,
        showId,
        rows,
      };
      y += height + GAP_Y;
      return positioned;
    });
  });
}

function connector(from: PositionedElement, to: PositionedElement, id: string, type: string): string {
  const forward = to.x > from.x;
  const reverse = to.x < from.x;
  let points: Array<[number, number]>;
  if (forward || reverse) {
    const startX = forward ? from.x + from.width : from.x;
    const endX = forward ? to.x : to.x + to.width;
    const startY = from.y + from.height / 2;
    const endY = to.y + to.height / 2;
    const middleX = (startX + endX) / 2;
    points = [[startX, startY], [middleX, startY], [middleX, endY], [endX, endY]];
  } else {
    const downward = to.y >= from.y;
    const startY = downward ? from.y + from.height : from.y;
    const endY = downward ? to.y : to.y + to.height;
    const direction = downward ? 1 : -1;
    const routeX = from.x + from.width + 24;
    const startX = from.x + from.width / 2;
    const endX = to.x + to.width / 2;
    const stub = Math.min(18, Math.max(8, Math.abs(endY - startY) / 3));
    points = [
      [startX, startY],
      [startX, startY + direction * stub],
      [routeX, startY + direction * stub],
      [routeX, endY - direction * stub],
      [endX, endY - direction * stub],
      [endX, endY],
    ];
  }
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const labelX = (points[1][0] + points[2][0]) / 2 + 6;
  const labelY = (points[1][1] + points[2][1]) / 2 - 6;
  return `<g class="archmap-lifecycle-relation" data-id="${escapeXml(id)}" data-type="${escapeXml(type)}"><path d="${path}" fill="none" stroke="#708497" stroke-width="1.5" marker-end="url(#lifecycle-arrow)"/><text x="${labelX}" y="${labelY}" font-size="11" fill="#53687a">${escapeXml(RELATION_LABELS[type] ?? type.replace(/_/g, " "))}</text></g>`;
}

export function renderLifecycleProjection(projection: Projection, className: string): string {
  const positioned = position(projection);
  const positions = new Map(positioned.map((element) => [element.id, element]));
  const width = PAD_X * 2 + projection.columns.length * CARD_WIDTH + Math.max(0, projection.columns.length - 1) * GAP_X;
  const height = Math.max(230, ...positioned.map((element) => element.y + element.height + 34));
  const connectors = projection.relations.map((relation) => {
    const from = positions.get(relation.from);
    const to = positions.get(relation.to);
    return from && to ? connector(from, to, relation.id, relation.type) : "";
  }).join("");
  const cards = positioned.map((element) => {
    const color = COLORS[element.type] ?? { fill: "#f4f6f8", stroke: "#687b8b" };
    const titleStart = element.y + 50;
    const titleEnd = titleStart + (element.titleLines.length - 1) * 18;
    const idY = titleEnd + 19;
    const rowsStart = (element.showId ? idY : titleEnd) + 19;
    const title = element.titleLines.map((line, index) => `<tspan x="${element.x + 14}" y="${titleStart + index * 18}">${escapeXml(line)}</tspan>`).join("");
    return `<g class="archmap-lifecycle-element archmap-lifecycle-${escapeXml(element.type)}" data-id="${escapeXml(element.id)}"><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="6" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.5"/><text x="${element.x + 14}" y="${element.y + 25}" font-size="11" font-weight="700" fill="${color.stroke}">${escapeXml(TYPE_LABELS[element.type] ?? element.type)}</text><text font-size="15" font-weight="600" fill="#16232f">${title}</text>${element.showId ? `<text x="${element.x + 14}" y="${idY}" font-size="11" fill="#617283">${escapeXml(element.id)}</text>` : ""}${element.rows.map((row, index) => `<text x="${element.x + 14}" y="${rowsStart + index * 14}" font-size="10" fill="#526577">${escapeXml(row)}</text>`).join("")}</g>`;
  }).join("");
  const empty = positioned.length === 0 ? '<text x="34" y="92" font-size="14" fill="#617283">No lifecycle elements in the current projection.</text>' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="archmap ${className}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs><marker id="lifecycle-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#708497"/></marker></defs><rect width="100%" height="100%" fill="#fbfcfd"/><text x="34" y="36" font-size="20" font-weight="700" fill="#16232f">${escapeXml(projection.title)}</text><text x="34" y="61" font-size="12" fill="#617283">${escapeXml(projection.description)}</text>${connectors}${empty}${cards}</svg>`;
}

export function renderRequirementsView(model: ArchMapModel): string {
  return renderLifecycleProjection(requirementsProjection(model), "archmap-view-requirements");
}

export function renderTraceabilityView(model: ArchMapModel, options: LifecycleViewOptions = {}): string {
  return renderLifecycleProjection(traceabilityProjection(model, options), "archmap-view-traceability");
}

export function renderQualityView(model: ArchMapModel, options: LifecycleViewOptions = {}): string {
  return renderLifecycleProjection(qualityProjection(model, options), "archmap-view-quality");
}

export const LIFECYCLE_VIEWS: readonly ViewDefinition[] = [
  { name: "requirements", renderer: ({ model }) => renderRequirementsView(model) },
  { name: "traceability", renderer: ({ model, options }) => renderTraceabilityView(model, lifecycleOptions(options.viewOptions?.lifecycle)) },
  { name: "quality", renderer: ({ model, options }) => renderQualityView(model, lifecycleOptions(options.viewOptions?.lifecycle)) },
];

/** Toolbar entries contributed by the lifecycle plugin. */
export const LIFECYCLE_DIAGRAM_TAG_VIEWS: readonly DiagramTagOption[] = [
  { value: "requirements", label: "Requirements" },
  { value: "traceability", label: "Traceability" },
  { value: "quality", label: "Quality" },
];
