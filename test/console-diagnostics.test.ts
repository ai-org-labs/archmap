import { describe, expect, it, vi } from "vitest";
import { parse } from "../src/parser-entry.js";
import { reportDiagnosticsToConsole } from "../src/diagnostics.js";
import { render } from "../src/render.js";

// A model with a warning (token without issuer) and an info (missing direction).
const source = `A[a] -->|JWT| B[b]`;

describe("configurable console diagnostics (spec 02 §23)", () => {
  it("logs errors and warnings by default as [ArchMap <level>] <code>: <message>", () => {
    const model = parse(source);
    const warn = vi.fn();
    reportDiagnosticsToConsole(model, { logger: { warning: warn, error: warn } });
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some(([m]) => /^\[ArchMap warning\] auth_token_without_issuer:/.test(m))).toBe(true);
  });

  it("does not log info/suggestion at the default levels", () => {
    const model = parse(source);
    const info = vi.fn();
    reportDiagnosticsToConsole(model, { logger: { info } });
    // missing_direction is info; default levels are error+warning only.
    expect(info).not.toHaveBeenCalled();
  });

  it("honors a custom level filter", () => {
    const model = parse(source);
    const calls: string[] = [];
    reportDiagnosticsToConsole(model, { levels: ["info"], logger: (_d, m) => calls.push(m) });
    expect(calls.some((m) => /missing_direction/.test(m))).toBe(true);
    expect(calls.every((m) => /\[ArchMap info\]/.test(m))).toBe(true);
  });

  it("is silent when disabled", () => {
    const model = parse(source);
    const sink = vi.fn();
    reportDiagnosticsToConsole(model, { enabled: false, logger: (_d, m) => sink(m) });
    expect(sink).not.toHaveBeenCalled();
  });

  it("render() reports to console only when the option is set", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(parse(source), { view: "overview" });
    const before = spy.mock.calls.length;
    render(parse(source), { view: "overview", console: true });
    expect(spy.mock.calls.length).toBeGreaterThan(before);
    spy.mockRestore();
  });
});
