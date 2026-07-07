import { describe, expect, it } from "vitest";
import { parse } from "../src/parser-entry.js";
import { toCanonicalModel } from "../src/canonical.js";
import {
  buildTimeDecoration,
  computePhasePresence,
  edgePresenceInterval,
  intersectIntervals,
  intervalContains,
  lifecycleStateAt,
  listTimelinePhases,
  presenceInterval,
  resolvePhaseId,
  timelinePhaseIndex,
} from "../src/time-projection.js";

const migrationExample = `graph LR
  Web[Web] --> AppOld[Legacy App]
  Web --> AppNew[Cloud App]
  AppOld --> DbOld[(Legacy DB)]
  AppNew --> DbNew[(Cloud DB)]
  DbOld --> DbNew
---
title: Migration sample
nodes:
  Web: { zone: client, layer: client }
  AppOld:
    zone: onprem
    layer: runtime
    lifecycle: { removed: done, states: { cutover: deprecated } }
  DbOld:
    zone: onprem
    layer: data
    lifecycle: { removed: done, states: { cutover: deprecated } }
  AppNew:
    zone: cloud
    layer: runtime
    lifecycle: { added: parallel, states: { parallel: planned, cutover: active } }
  DbNew:
    zone: cloud
    layer: data
    lifecycle: { added: parallel }
edges:
  DbOld->DbNew:
    flow: replication
    lifecycle: { added: parallel, removed: done }
zones:
  client: { label: Client, contains: [Web] }
  onprem:
    label: On-premises
    contains: [AppOld, DbOld]
    lifecycle: { removed: done }
  cloud:
    label: Cloud
    contains: [AppNew, DbNew]
    lifecycle: { added: parallel }
timeline:
  label: Cloud migration
  phases:
    now: { label: Today }
    parallel: { label: Parallel run, at: 2026-Q3 }
    cutover: { label: Cutover }
    done: { label: Cloud only }
  default: now
`;

function diagnosticCodes(model: ReturnType<typeof parse>): string[] {
  return model.diagnostics.map((d) => d.code);
}

describe("timeline parsing", () => {
  it("parses phases in declaration order with default", () => {
    const model = parse(migrationExample);
    expect(model.errors).toEqual([]);
    expect(model.timeline?.label).toBe("Cloud migration");
    expect(model.timeline?.phases.map((p) => p.id)).toEqual(["now", "parallel", "cutover", "done"]);
    expect(model.timeline?.phases[1].at).toBe("2026-Q3");
    expect(model.timeline?.default).toBe("now");
  });

  it("parses element lifecycles", () => {
    const model = parse(migrationExample);
    const appNew = model.nodes.find((n) => n.id === "AppNew");
    expect(appNew?.lifecycle).toEqual({ added: "parallel", states: { parallel: "planned", cutover: "active" } });
    const replication = model.edges.find((e) => e.pairKey === "DbOld->DbNew");
    expect(replication?.lifecycle).toEqual({ added: "parallel", removed: "done" });
    const onprem = model.zones.find((z) => z.id === "onprem");
    expect(onprem?.lifecycle).toEqual({ removed: "done" });
  });

  it("applies order: and reports unknown/duplicate/incomplete refs", () => {
    const model = parse(`graph LR\n  A --> B\n---\ntimeline:\n  phases:\n    p1: {}\n    p2: {}\n    p3: {}\n  order: [p2, ghost, p2, p1]\n`);
    expect(model.timeline?.phases.map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
    const codes = diagnosticCodes(model);
    expect(codes).toContain("timeline_unknown_order_ref");
    expect(codes).toContain("timeline_order_duplicate");
    expect(codes).toContain("timeline_order_incomplete");
  });

  it("warns on empty timeline and unknown default", () => {
    const empty = parse(`graph LR\n  A --> B\n---\ntimeline:\n  phases: {}\n`);
    expect(empty.timeline).toBeUndefined();
    expect(diagnosticCodes(empty)).toContain("timeline_empty");

    const unknownDefault = parse(`graph LR\n  A --> B\n---\ntimeline:\n  phases:\n    p1: {}\n  default: ghost\n`);
    expect(diagnosticCodes(unknownDefault)).toContain("timeline_unknown_default");
    expect(unknownDefault.timeline?.default).toBeUndefined();
  });

  it("keeps documents without a timeline untouched", () => {
    const model = parse(`graph LR\n  A[Node A] --> B[Node B]\n---\nnodes:\n  A: { zone: web, layer: client, kind: web_app }\n  B: { zone: web, layer: runtime, kind: runtime_service }\n`);
    expect(model.timeline).toBeUndefined();
    expect(diagnosticCodes(model).filter((code) => code.startsWith("timeline") || code.startsWith("lifecycle"))).toEqual([]);
  });

  it("passes the timeline through to the canonical model", () => {
    const canonical = toCanonicalModel(parse(migrationExample));
    expect(canonical.timeline?.phases.map((p) => p.id)).toEqual(["now", "parallel", "cutover", "done"]);
  });
});

describe("lifecycle validation", () => {
  it("errors on unknown phase references and inverted intervals", () => {
    const model = parse(`graph LR\n  A --> B\n---\nnodes:\n  A:\n    lifecycle: { added: ghost }\n  B:\n    lifecycle: { added: p2, removed: p1, states: { ghost: planned } }\ntimeline:\n  phases:\n    p1: {}\n    p2: {}\n`);
    const codes = diagnosticCodes(model);
    expect(codes.filter((code) => code === "lifecycle_unknown_phase").length).toBeGreaterThanOrEqual(2);
    expect(codes).toContain("lifecycle_removed_before_added");
  });

  it("warns on lifecycle without timeline, unknown states, and states while absent", () => {
    const withoutTimeline = parse(`graph LR\n  A --> B\n---\nnodes:\n  A:\n    lifecycle: { removed: p1 }\n`);
    expect(diagnosticCodes(withoutTimeline)).toContain("lifecycle_without_timeline");

    const model = parse(`graph LR\n  A --> B\n---\nnodes:\n  A:\n    lifecycle: { added: p2, states: { p1: wat } }\ntimeline:\n  phases:\n    p1: {}\n    p2: {}\n`);
    const codes = diagnosticCodes(model);
    expect(codes).toContain("unknown_lifecycle_state");
    expect(codes).toContain("lifecycle_state_while_absent");
  });

  it("warns when a declared edge lifecycle exceeds its endpoints", () => {
    const model = parse(`graph LR\n  A --> B\n---\nnodes:\n  B:\n    lifecycle: { added: p2 }\nedges:\n  A->B:\n    lifecycle: { added: p1 }\ntimeline:\n  phases:\n    p1: {}\n    p2: {}\n`);
    expect(diagnosticCodes(model)).toContain("lifecycle_edge_endpoint_absent");
  });

  it("warns when a zone is absent while a member node is present", () => {
    const model = parse(`graph LR\n  A --> B\n---\nzones:\n  z1:\n    contains: [A, B]\n    lifecycle: { removed: p2 }\ntimeline:\n  phases:\n    p1: {}\n    p2: {}\n`);
    expect(diagnosticCodes(model)).toContain("lifecycle_zone_member_present");
  });
});

describe("phase presence", () => {
  const model = parse(migrationExample);

  it("resolves phases and defaults", () => {
    expect(listTimelinePhases(model).map((p) => p.id)).toEqual(["now", "parallel", "cutover", "done"]);
    expect(resolvePhaseId(model)).toBe("now");
    expect(resolvePhaseId(model, "cutover")).toBe("cutover");
    expect(resolvePhaseId(model, "ghost")).toBe("now");
    expect(resolvePhaseId({ timeline: undefined })).toBeUndefined();
  });

  it("computes node presence per phase", () => {
    const now = computePhasePresence(model, "now")!;
    expect(now.absentNodes).toEqual(new Set(["AppNew", "DbNew"]));
    expect(now.absentZones).toEqual(new Set(["cloud"]));

    const parallel = computePhasePresence(model, "parallel")!;
    expect(parallel.absentNodes).toEqual(new Set());
    expect(parallel.nodeStates.get("AppNew")).toBe("planned");

    const done = computePhasePresence(model, "done")!;
    expect(done.absentNodes).toEqual(new Set(["AppOld", "DbOld"]));
    expect(done.absentZones).toEqual(new Set(["onprem"]));
    expect(done.nodeStates.get("AppNew")).toBeUndefined(); // back to active
  });

  it("derives edge presence from endpoints and clamps declared lifecycles", () => {
    const now = computePhasePresence(model, "now")!;
    // Edges touching AppNew/DbNew are absent because their endpoints are.
    const replication = model.edges.find((e) => e.pairKey === "DbOld->DbNew")!;
    expect(now.absentEdges.has(replication.id)).toBe(true);
    const webToNew = model.edges.find((e) => e.pairKey === "Web->AppNew")!;
    expect(now.absentEdges.has(webToNew.id)).toBe(true);

    const parallel = computePhasePresence(model, "parallel")!;
    expect(parallel.absentEdges.has(replication.id)).toBe(false);

    const done = computePhasePresence(model, "done")!;
    // Declared removed: done, and DbOld is gone anyway.
    expect(done.absentEdges.has(replication.id)).toBe(true);
  });

  it("keeps sticky states until overridden", () => {
    const phaseIndex = timelinePhaseIndex(model.timeline);
    const appOld = model.nodes.find((n) => n.id === "AppOld")!;
    expect(lifecycleStateAt(appOld.lifecycle, phaseIndex.get("now")!, phaseIndex)).toBeUndefined();
    expect(lifecycleStateAt(appOld.lifecycle, phaseIndex.get("cutover")!, phaseIndex)).toBe("deprecated");
    // done: sticky forward (element absent there, but state math stays sticky)
    expect(lifecycleStateAt(appOld.lifecycle, phaseIndex.get("done")!, phaseIndex)).toBe("deprecated");
  });

  it("returns undefined for unknown phases or missing timelines", () => {
    expect(computePhasePresence(model, "ghost")).toBeUndefined();
    const bare = parse("graph LR\n  A --> B\n");
    expect(computePhasePresence(bare, "now")).toBeUndefined();
  });

  it("interval helpers behave as documented", () => {
    const phaseIndex = new Map([["p1", 0], ["p2", 1], ["p3", 2]]);
    expect(presenceInterval(undefined, phaseIndex)).toEqual({ addedIndex: 0, removedIndex: Number.POSITIVE_INFINITY });
    expect(presenceInterval({ added: "p2" }, phaseIndex)).toEqual({ addedIndex: 1, removedIndex: Number.POSITIVE_INFINITY });
    expect(presenceInterval({ added: "ghost", removed: "ghost" }, phaseIndex)).toEqual({ addedIndex: 0, removedIndex: Number.POSITIVE_INFINITY });
    expect(intersectIntervals({ addedIndex: 0, removedIndex: 2 }, { addedIndex: 1, removedIndex: 5 })).toEqual({ addedIndex: 1, removedIndex: 2 });
    expect(intervalContains({ addedIndex: 1, removedIndex: 2 }, 1)).toBe(true);
    expect(intervalContains({ addedIndex: 1, removedIndex: 2 }, 2)).toBe(false);
    expect(edgePresenceInterval({ added: "p1" }, { added: "p2" }, undefined, phaseIndex)).toEqual({ addedIndex: 1, removedIndex: Number.POSITIVE_INFINITY });
  });

  it("maps presence to ghost/state decoration classes", () => {
    const decoration = buildTimeDecoration(computePhasePresence(model, "parallel")!);
    expect(decoration.nodeExtraClasses.get("AppNew")).toBe("archmap-lifecycle-planned");
    expect(decoration.nodeExtraClasses.get("Web")).toBeUndefined();
    const cutover = buildTimeDecoration(computePhasePresence(model, "cutover")!);
    expect(cutover.nodeExtraClasses.get("AppOld")).toBe("archmap-lifecycle-deprecated");
    const now = buildTimeDecoration(computePhasePresence(model, "now")!);
    expect(now.nodeExtraClasses.get("AppNew")).toBe("archmap-phase-absent");
    expect(now.boxExtraClasses.get("cloud")).toBe("archmap-phase-absent");
  });
});
