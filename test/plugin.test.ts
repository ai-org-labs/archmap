import { describe, expect, it } from "vitest";
import {
  createArchMap,
  defaultArchMap,
  render,
  use,
  type ArchMapPlugin,
  type Diagnostic,
} from "../src/index.js";

const source = "graph LR\n  A[A] --> B[B]";

describe("plugin registry", () => {
  it("preserves top-level render convenience through the default instance", () => {
    const plugin: ArchMapPlugin = {
      name: "top-level-view-test",
      version: "1.0.0",
      views: [{ name: "top-level-example", renderer: () => '<svg class="top-level-example"></svg>' }],
    };
    try {
      use(plugin);
      const model = defaultArchMap.parse(source);
      expect(render(model, { baseView: "top-level-example" }).svg).toContain('class="top-level-example"');
    } finally {
      defaultArchMap.unuse(plugin.name);
    }
  });

  it("isolates plugins, validators, and views between instances", () => {
    const left = createArchMap();
    const right = createArchMap();
    const plugin: ArchMapPlugin = {
      name: "example",
      version: "1.0.0",
      elementTypes: [{ name: "example_item", section: "examples" }],
      relationTypes: [{ name: "example_link" }],
      validators: [{
        name: "example_validator",
        validate: (): Diagnostic[] => [{
          severity: "info",
          level: "info",
          code: "example_info",
          message: "example installed",
          target: { type: "extension", id: "example" },
        }],
      }],
      views: [{ name: "example", renderer: () => '<svg class="example"></svg>' }],
    };

    left.use(plugin);
    expect(left.listElementTypes()).toEqual(["example_item"]);
    expect(left.listRelationTypes()).toEqual(["example_link"]);
    expect(left.listValidators()).toEqual(["example_validator"]);
    expect(left.listViews()).toContain("example");
    expect(right.listElementTypes()).toEqual([]);
    expect(right.listViews()).not.toContain("example");
    expect(left.parse(source).infos.some((item) => item.code === "example_info")).toBe(true);
    expect(right.parse(source).infos.some((item) => item.code === "example_info")).toBe(false);
    expect(left.render(left.parse(source), { baseView: "example" }).svg).toContain('class="example"');
    expect(() => right.render(right.parse(source), { baseView: "example" })).toThrow(/Unknown view/);
  });

  it("is idempotent for the same plugin version and supports cleanup", () => {
    const archmap = createArchMap();
    let cleanupCount = 0;
    const plugin: ArchMapPlugin = {
      name: "cleanup",
      version: "1.0.0",
      install: (context) => {
        context.registerElementType({ name: "temporary" });
        return () => { cleanupCount += 1; };
      },
    };
    expect(archmap.use(plugin)).toBe(archmap);
    expect(archmap.use(plugin)).toBe(archmap);
    expect(archmap.listPlugins()).toEqual([{ name: "cleanup", version: "1.0.0" }]);
    expect(archmap.unuse("cleanup")).toBe(true);
    expect(cleanupCount).toBe(1);
    expect(archmap.getElementType("temporary")).toBeUndefined();
  });

  it("rejects conflicting registrations, versions, dependencies, and plugins", () => {
    const archmap = createArchMap();
    archmap.use({ name: "base", version: "1.2.0", elementTypes: [{ name: "shared" }] });
    expect(() => archmap.use({ name: "base", version: "2.0.0" })).toThrow(/already installed/);
    expect(() => archmap.use({ name: "duplicate", version: "1.0.0", elementTypes: [{ name: "shared" }] })).toThrow(/already registered/);
    expect(() => archmap.use({ name: "missing", version: "1.0.0", requires: { absent: "^1.0.0" } })).toThrow(/requires missing/);
    expect(() => archmap.use({ name: "wrong", version: "1.0.0", requires: { base: "^2.0.0" } })).toThrow(/requires.*found/);
    expect(() => archmap.use({ name: "conflict", version: "1.0.0", conflicts: ["base"] })).toThrow(/conflicts/);
    expect(() => archmap.use({ name: "future-core", version: "1.0.0", requires: { "@archmap/core": "^1.0.0" } })).toThrow(/requires.*core/);
  });

  it("retains inert extension graph records on instance-parsed models", () => {
    const model = createArchMap().parse(source);
    expect(model.extensions).toEqual({ elements: [], relations: [] });
    model.extensions?.elements.push({ id: "custom-1", type: "custom", title: "Custom" });
    model.extensions?.relations.push({ id: "rel-1", type: "links", from: "custom-1", to: "A" });
    expect(model.extensions?.elements[0]?.type).toBe("custom");
    expect(model.extensions?.relations[0]?.to).toBe("A");
  });
});
