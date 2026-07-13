import { describe, expect, it } from "vitest";
import { createArchMap, defaultArchMap, render } from "../src/index.js";
import lifecycle, {
  installLifecycle,
  LIFECYCLE_ELEMENT_TYPES,
  LIFECYCLE_RELATION_TYPES,
  serializeLifecycle,
} from "../packages/lifecycle/src/index.js";

const source = "graph LR\n  Login[Login] --> API[API]";
const lifecycleSource = `${source}
---
requirements:
  REQ-LOGIN:
    title: User can sign in
    type: functional
    extensions:
      sourceSystem: product
acceptanceCriteria:
  AC-LOGIN:
    requirement: REQ-LOGIN
    statement: Successful sign-in displays Home
tests:
  TEST-LOGIN:
    title: Login end-to-end test
    type: end_to_end
evidence:
  EVD-LOGIN:
    type: test_result
    status: passed
relations:
  - { from: REQ-LOGIN, to: Login, type: realized_by }
  - { id: verifies-login, from: AC-LOGIN, to: TEST-LOGIN, type: verified_by }
  - { from: TEST-LOGIN, to: EVD-LOGIN, type: evidenced_by }
customLifecycleNotes:
  author: product`;

describe("@archmap/lifecycle plugin", () => {
  it("installs schema, relations, validator, and views into one isolated instance", () => {
    const archmap = createArchMap().use(lifecycle);
    expect(archmap.listElementTypes()).toEqual(LIFECYCLE_ELEMENT_TYPES.map(({ name }) => name));
    expect(archmap.listRelationTypes()).toEqual(LIFECYCLE_RELATION_TYPES.map(({ name }) => name));
    expect(archmap.listValidators()).toContain("lifecycle_traceability_gaps");
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

  it("normalizes registered YAML sections with stable IDs, provenance, and endpoint kinds", () => {
    const archmap = createArchMap().use(lifecycle);
    const first = archmap.parse(lifecycleSource);
    const second = archmap.parse(lifecycleSource);
    expect(first.extensions?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "REQ-LOGIN",
        elementType: "requirement",
        type: "functional",
        title: "User can sign in",
        provenance: { section: "requirements", id: "REQ-LOGIN" },
        extensions: { sourceSystem: "product" },
      }),
    ]));
    expect(first.extensions?.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "REQ-LOGIN__realized_by__Login__0",
        fromKind: "requirement",
        toKind: "node",
        registeredType: true,
      }),
      expect.objectContaining({ id: "verifies-login", fromKind: "acceptanceCriterion", toKind: "test" }),
    ]));
    expect(first.extensions?.sections).toEqual({ customLifecycleNotes: { author: "product" } });
    expect(JSON.stringify(first.extensions)).toBe(JSON.stringify(second.extensions));
    expect(serializeLifecycle(first)).toBe(serializeLifecycle(second));
    expect(JSON.parse(serializeLifecycle(first))).toMatchObject({
      elements: expect.arrayContaining([expect.objectContaining({ id: "REQ-LOGIN", elementType: "requirement", type: "functional" })]),
      relations: expect.arrayContaining([expect.objectContaining({ id: "REQ-LOGIN__realized_by__Login__0" })]),
    });
    expect(first.warnings.some((item) => item.code === "plugin_required" && item.target?.id === "requirements")).toBe(false);
  });

  it("targets structural and traceability gap diagnostics at responsible IDs", () => {
    const model = createArchMap().use(lifecycle).parse(`${source}
---
requirements:
  Login: { title: Duplicate architecture ID, type: functional }
  REQ-GAP: { title: Missing acceptance, type: functional }
  REQ-BAD: { title: Missing type }
acceptanceCriteria:
  AC-GAP: { requirement: REQ-GAP, statement: Must work }
tests:
  TEST-GAP: { title: Required test, type: acceptance }
relations:
  - { from: AC-GAP, to: MISSING, type: verified_by }
  - { from: REQ-GAP, to: REQ-GAP, type: refines }
  - { from: REQ-GAP, to: REQ-BAD, type: refines }
  - { from: REQ-BAD, to: REQ-GAP, type: refines }
  - { from: REQ-GAP, to: Login, type: made_up }`);
    const codes = new Set(model.diagnostics.map((item) => item.code));
    const expectedCodes = [
      "extension_duplicate_id", "extension_schema_mismatch", "extension_missing_reference",
      "extension_invalid_relation", "extension_self_dependency", "extension_relation_cycle",
      "requirement_without_acceptance", "acceptance_without_test", "test_without_evidence",
    ];
    expect([...codes]).toEqual(expect.arrayContaining(expectedCodes));
    expect(model.diagnostics
      .filter((item) => expectedCodes.includes(item.code))
      .every((item) => Boolean(item.target?.id))).toBe(true);
  });
});
