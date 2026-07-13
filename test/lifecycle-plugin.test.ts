import { describe, expect, it } from "vitest";
import { createArchMap, defaultArchMap, render } from "../src/index.js";
import lifecycle, {
  installLifecycle,
  LIFECYCLE_ELEMENT_TYPES,
  LIFECYCLE_RELATION_TYPES,
} from "../packages/lifecycle/src/index.js";

const source = "graph LR\n  Login[Login] --> API[API]";

describe("@archmap/lifecycle plugin", () => {
  it("installs schema, relations, validator, and views into one isolated instance", () => {
    const archmap = createArchMap().use(lifecycle);
    expect(archmap.listElementTypes()).toEqual(LIFECYCLE_ELEMENT_TYPES.map(({ name }) => name));
    expect(archmap.listRelationTypes()).toEqual(LIFECYCLE_RELATION_TYPES.map(({ name }) => name));
    expect(archmap.listValidators()).toContain("lifecycle_registered_schema");
    expect(archmap.listViews()).toEqual(expect.arrayContaining(["requirements", "traceability", "quality"]));
    expect(createArchMap().listElementTypes()).toEqual([]);
  });

  it("is idempotent and renders lifecycle views from inert extension records", () => {
    const archmap = createArchMap();
    expect(installLifecycle(archmap)).toBe(archmap);
    expect(installLifecycle(archmap)).toBe(archmap);
    const model = archmap.parse(source);
    model.extensions?.elements.push({ id: "REQ-001", type: "requirement", title: "User can sign in" });
    expect(archmap.render(model, { baseView: "requirements" }).svg).toContain("User can sign in");
  });

  it("supports the default-instance ESM convenience path used by browser/CDN and Node consumers", () => {
    try {
      installLifecycle();
      const model = defaultArchMap.parse(source);
      expect(render(model, { baseView: "traceability" }).svg).toContain("archmap-view-traceability");
    } finally {
      defaultArchMap.unuse("@archmap/lifecycle");
    }
  });
});
