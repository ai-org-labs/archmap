import type { ArchMapModel, ExtensionElement, ViewDefinition } from "@archmap/core";

const LIFECYCLE_TYPES = new Set(["requirement", "acceptanceCriterion", "decision", "risk", "test", "evidence"]);

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function elementsFor(model: ArchMapModel, allowed: Set<string>): ExtensionElement[] {
  return (model.extensions?.elements ?? []).filter((element) => allowed.has(element.type));
}

function projectionView(name: string, title: string, allowed: Set<string>): ViewDefinition {
  return {
    name,
    renderer: ({ model }) => {
      const elements = elementsFor(model, allowed);
      const width = 960;
      const columns = 4;
      const cardWidth = 200;
      const cardHeight = 92;
      const gapX = 28;
      const gapY = 28;
      const rows = Math.max(1, Math.ceil(elements.length / columns));
      const height = 90 + rows * (cardHeight + gapY);
      const cards = elements.map((element, index) => {
        const x = 28 + (index % columns) * (cardWidth + gapX);
        const y = 62 + Math.floor(index / columns) * (cardHeight + gapY);
        const label = element.title ?? element.id;
        return `<g class="archmap-lifecycle-element archmap-lifecycle-${escapeXml(element.type)}" data-id="${escapeXml(element.id)}"><rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="6" fill="#fff" stroke="#49657a"/><text x="${x + 14}" y="${y + 35}" font-size="16" fill="#16232f">${escapeXml(label)}</text><text x="${x + 14}" y="${y + 62}" font-size="12" fill="#617283">${escapeXml(element.type)} · ${escapeXml(element.id)}</text></g>`;
      }).join("");
      const empty = elements.length === 0
        ? '<text x="28" y="88" font-size="14" fill="#617283">No lifecycle elements in the current projection.</text>'
        : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" class="archmap archmap-view-${name}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f7f9fb"/><text x="28" y="34" font-size="20" font-weight="600" fill="#16232f">${escapeXml(title)}</text>${empty}${cards}</svg>`;
    },
  };
}

export const LIFECYCLE_VIEWS: readonly ViewDefinition[] = [
  projectionView("requirements", "Requirements", new Set(["requirement", "acceptanceCriterion", "decision", "risk"])),
  projectionView("traceability", "Traceability", LIFECYCLE_TYPES),
  projectionView("quality", "Quality", new Set(["requirement", "acceptanceCriterion", "test", "evidence"])),
];
