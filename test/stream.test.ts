import { describe, expect, it, vi } from "vitest";
import { createArchMapStream } from "../src/stream.js";

describe("createArchMapStream", () => {
  it("buffers chunks and renders on flush", () => {
    const seen: string[] = [];
    const session = createArchMapStream({
      debounceMs: 0,
      renderOptions: { baseView: "overview" },
      onResult: (result) => seen.push(result.view),
    });

    session.write("graph LR\n");
    session.write("  Web[Web App] --> API[API Gateway]\n");

    const result = session.flush();
    expect(result?.view).toBe("overview");
    expect(result?.svg).toContain("Web App");
    expect(session.getModel()?.nodes.map((node) => node.id)).toEqual(["Web", "API"]);
    expect(seen[seen.length - 1]).toBe("overview");
  });

  it("pipes a ReadableStream of source chunks", async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("graph LR\n");
        controller.enqueue("  Home[Home] --> Login[Login]\n");
        controller.close();
      },
    });
    const session = createArchMapStream({ debounceMs: 1000, renderOptions: { baseView: "layer" } });

    const result = await session.pipe(stream);

    expect(result?.view).toBe("layer");
    expect(result?.svg).toContain("Home");
    expect(session.getSource()).toContain("Login");
  });

  it("debounces write-triggered renders", () => {
    vi.useFakeTimers();
    try {
      const onResult = vi.fn();
      const session = createArchMapStream({ debounceMs: 50, onResult });

      session.write("graph LR\n");
      session.write("  A[A] --> B[B]\n");
      expect(onResult).not.toHaveBeenCalled();

      vi.advanceTimersByTime(49);
      expect(onResult).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(session.getResult()?.svg).toContain("A");
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts pending work and clears the current render", () => {
    vi.useFakeTimers();
    try {
      const onResult = vi.fn();
      const session = createArchMapStream({ debounceMs: 50, onResult });
      session.write("graph LR\n  A[A] --> B[B]\n");
      session.abort();

      vi.advanceTimersByTime(50);

      expect(onResult).not.toHaveBeenCalled();
      expect(session.getResult()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
