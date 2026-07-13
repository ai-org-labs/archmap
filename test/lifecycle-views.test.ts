import { describe, expect, it } from "vitest";
import { createArchMap } from "../src/index.js";
import lifecycle, {
  qualityProjection,
  renderQualityView,
  renderRequirementsView,
  renderTraceabilityView,
  requirementsProjection,
  traceabilityProjection,
} from "../packages/lifecycle/src/index.js";

const source = `graph LR
  Login[Login API] --> Audit[Audit Store]
  Other[Unrelated component]
---
requirements:
  REQ-ROOT: { title: Secure access, type: security, status: approved, priority: must, owner: product }
  REQ-LOGIN: { title: Users can sign in, type: functional, status: implemented, priority: must, owner: identity }
acceptanceCriteria:
  AC-LOGIN: { requirement: REQ-LOGIN, statement: Successful login opens Home, status: approved }
tests:
  TEST-LOGIN: { title: Login end-to-end, type: end_to_end, status: passed, result: passed }
evidence:
  EVD-LOGIN: { type: test_result, status: passed, producedBy: TEST-LOGIN, expiresAt: 2099-01-01T00:00:00Z }
risks:
  RISK-OTHER: { title: Unrelated risk, status: monitoring }
relations:
  - { from: REQ-ROOT, to: REQ-LOGIN, type: decomposes }
  - { from: REQ-LOGIN, to: Login, type: implemented_by }
  - { from: AC-LOGIN, to: TEST-LOGIN, type: verified_by }
  - { from: TEST-LOGIN, to: EVD-LOGIN, type: evidenced_by }`;

function model() {
  return createArchMap().use(lifecycle).parse(source);
}

function pathSegments(svg: string): Array<Array<[number, number]>> {
  return [...svg.matchAll(/<path d="([ML\d. ]+)" fill="none"/g)].map((match) =>
    [...match[1].matchAll(/[ML](\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)]
      .map((point) => [Number(point[1]), Number(point[2])] as [number, number]),
  );
}

describe("lifecycle projection views", () => {
  it("renders requirement hierarchy, metadata, acceptance, and allocated architecture only", () => {
    const parsed = model();
    const projection = requirementsProjection(parsed);
    expect(projection.elements.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "REQ-ROOT", "REQ-LOGIN", "AC-LOGIN", "Login",
    ]));
    expect(projection.elements.map(({ id }) => id)).not.toEqual(expect.arrayContaining([
      "TEST-LOGIN", "EVD-LOGIN", "Other", "RISK-OTHER",
    ]));
    const svg = renderRequirementsView(parsed);
    expect(svg).toContain("Secure access");
    expect(svg).toContain("status: approved");
    expect(svg).toContain("priority: must");
    expect(svg).toContain("owner: product");
    expect(svg).toContain("accepted_by");
    expect(svg).toContain("Login API");
  });

  it("traces from a selected start with depth, type, and status filters", () => {
    const parsed = model();
    const depthOne = traceabilityProjection(parsed, { start: "REQ-ROOT", maxDepth: 1 });
    expect(depthOne.elements.map(({ id }) => id)).toEqual(["REQ-LOGIN", "REQ-ROOT"]);
    const filtered = traceabilityProjection(parsed, {
      start: "REQ-ROOT",
      maxDepth: 5,
      types: ["requirement", "acceptanceCriterion", "test"],
      statuses: ["approved", "implemented", "passed"],
    });
    expect(filtered.elements.map(({ id }) => id)).toEqual(expect.arrayContaining(["REQ-ROOT", "REQ-LOGIN"]));
    expect(filtered.elements.map(({ id }) => id)).not.toContain("Login");
    expect(renderTraceabilityView(parsed, { start: "REQ-ROOT", maxDepth: 1 })).not.toContain("Audit Store");
  });

  it("renders quality status, result, freshness, and no unrelated graph records", () => {
    const parsed = model();
    expect(qualityProjection(parsed).elements.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "REQ-LOGIN", "AC-LOGIN", "TEST-LOGIN", "EVD-LOGIN",
    ]));
    const svg = renderQualityView(parsed, { now: "2026-07-13T00:00:00Z" });
    expect(svg).toContain("result: passed");
    expect(svg).toContain(">fresh<");
    expect(svg).not.toContain("Unrelated component");
    expect(svg).not.toContain("Unrelated risk");
  });

  it("keeps all lifecycle connector segments orthogonal", () => {
    const views = [renderRequirementsView(model()), renderTraceabilityView(model(), { start: "REQ-ROOT" }), renderQualityView(model())];
    for (const svg of views) {
      const paths = pathSegments(svg);
      expect(paths.length).toBeGreaterThan(0);
      for (const points of paths) {
        for (let index = 1; index < points.length; index += 1) {
          expect(points[index][0] === points[index - 1][0] || points[index][1] === points[index - 1][1]).toBe(true);
        }
      }
    }
  });

  it("renders architecture and lifecycle projections independently from one canonical model", () => {
    const archmap = createArchMap().use(lifecycle);
    const parsed = archmap.parse(source);
    expect(archmap.render(parsed, { baseView: "overview" }).svg).toContain("Login API");
    expect(archmap.render(parsed, { baseView: "requirements" }).svg).toContain("Users can sign in");
    expect(archmap.render(parsed, { baseView: "quality" }).svg).toContain("Login end-to-end");
  });
});
