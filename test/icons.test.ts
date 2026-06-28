import { beforeEach, describe, expect, it } from "vitest";
import { parse } from "../src/parser-entry.js";
import { render } from "../src/render.js";
import {
  registerIcon,
  resolveIcon,
  resolveNodeIcons,
  clearIcons,
  iconDomId,
} from "../src/icons.js";

const dot = { viewBox: "0 0 24 24", body: '<circle cx="12" cy="12" r="10" />' };

beforeEach(() => clearIcons());

describe("icon registry", () => {
  it("resolves most-specific first: provider/kind > provider > kind", () => {
    registerIcon("aws", dot);
    registerIcon("aws/relational_database", dot);
    registerIcon("database", dot);
    expect(resolveIcon("aws", "relational_database")?.key).toBe("aws/relational_database");
    expect(resolveIcon("aws", "queue")?.key).toBe("aws");
    expect(resolveIcon(undefined, "database")?.key).toBe("database");
    expect(resolveIcon("gcp", "queue")).toBeUndefined();
  });

  it("maps node ids to icons via provider/kind", () => {
    registerIcon("gcp", dot);
    const m = parse(`graph LR
      A[a]
      ---
      nodes:
        A: { provider: gcp, kind: serverless_service }
    `);
    const icons = resolveNodeIcons(m);
    const icon = icons.get("A");
    expect(Array.isArray(icon) ? icon[0]?.key : icon?.key).toBe("gcp");
  });

  it("sanitizes keys into DOM-safe ids", () => {
    expect(iconDomId("aws/relational_database")).toBe("archmap-icon-aws-relational_database");
  });
});

describe("icons in rendering", () => {
  it("emits a symbol def and a use reference for iconed nodes", () => {
    registerIcon("gcp", dot);
    const m = parse(`graph LR
      A[a] --> B[b]
      ---
      nodes:
        A: { provider: gcp, kind: api_gateway }
    `);
    const { svg } = render(m, { view: "overview" });
    expect(svg).toContain('<symbol id="archmap-icon-gcp"');
    expect(svg).toContain('href="#archmap-icon-gcp"');
  });

  it("renders every available member icon inside a collapsed abstraction node", () => {
    registerIcon("gcp", dot);
    registerIcon("aws", dot);
    registerIcon("datadog", dot);
    const m = parse(`graph LR
      A[API] --> D[Database]
      B[Worker] --> D
      C[Metrics] --> D
      E[Sidecar] --> D
      ---
      nodes:
        A: { provider: gcp, kind: api_gateway }
        B: { provider: aws, kind: runtime_service }
        C: { provider: datadog, kind: monitoring }
        E: { provider: gcp, kind: serverless_service }
      zones:
        service:
          contains: [A, B, C, E]
    `);
    const { svg } = render(m, { baseView: "overview", overlays: ["zone"], collapsedAbstractions: ["zone:service"] });
    expect(svg).toContain('data-abstraction-key="zone:service"');
    expect(svg!.match(/class="archmap-node-icon archmap-abstraction-icon"/g)?.length).toBe(4);
    expect(svg).toContain('href="#archmap-icon-gcp"');
    expect(svg).toContain('href="#archmap-icon-aws"');
    expect(svg).toContain('href="#archmap-icon-datadog"');
    expect(svg!.match(/href="#archmap-icon-gcp"/g)?.length).toBe(2);
    const match = svg!.match(/data-id="service"[^>]*data-w="([0-9.]+)" data-h="([0-9.]+)"/);
    expect(Number(match?.[1])).toBeGreaterThan(96);
    expect(Number(match?.[2])).toBeGreaterThan(48);
  });

  it("omits icons entirely when none are registered", () => {
    const m = parse(`graph LR\nA[a] --> B[b]`);
    const { svg } = render(m, { view: "overview" });
    expect(svg).not.toContain("archmap-node-icon");
    expect(svg).not.toContain("<symbol");
  });
});
