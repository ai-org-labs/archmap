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
    expect(icons.get("A")?.key).toBe("gcp");
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

  it("omits icons entirely when none are registered", () => {
    const m = parse(`graph LR\nA[a] --> B[b]`);
    const { svg } = render(m, { view: "overview" });
    expect(svg).not.toContain("archmap-node-icon");
    expect(svg).not.toContain("<symbol");
  });
});
