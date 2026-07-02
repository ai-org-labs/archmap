import { parse } from "./parser-entry.js";
import { render } from "./render.js";
import type { RenderOptions, RenderResult } from "./render.js";
import type { ArchMapModel } from "./types.js";

export type ArchMapStreamChunk = string | Uint8Array;

export interface ArchMapStreamOptions {
  /** DOM target used by render(). Omit for headless parsing/rendering. */
  target?: Element | null;
  /** Render options applied to every flushed model. */
  renderOptions?: Omit<RenderOptions, "target">;
  /** Debounce delay for write() calls. Default: 120ms. Use 0 for immediate flush. */
  debounceMs?: number;
  /** Called after each successful parse. */
  onModel?(model: ArchMapModel): void;
  /** Called after each successful render. */
  onResult?(result: RenderResult): void;
  /** Called when parse/render fails. */
  onError?(error: unknown): void;
}

export interface ArchMapStreamSession {
  write(chunk: ArchMapStreamChunk): void;
  flush(): RenderResult | undefined;
  close(): Promise<RenderResult | undefined>;
  abort(): void;
  pipe(stream: ReadableStream<ArchMapStreamChunk>): Promise<RenderResult | undefined>;
  getSource(): string;
  getModel(): ArchMapModel | undefined;
  getResult(): RenderResult | undefined;
}

/**
 * Buffered streaming interface for live/generated ArchMap source.
 *
 * This is intentionally not an incremental parser. Chunks are buffered, then
 * the complete source is reparsed and rerendered on debounce/flush boundaries.
 * The API shape allows a future incremental parser without changing callers.
 */
export function createArchMapStream(options: ArchMapStreamOptions = {}): ArchMapStreamSession {
  let source = "";
  let model: ArchMapModel | undefined;
  let result: RenderResult | undefined;
  let dirty = false;
  let closed = false;
  let aborted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const decoder = new TextDecoder();

  const debounceMs = Math.max(0, options.debounceMs ?? 120);

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (): void => {
    clearTimer();
    if (debounceMs === 0) {
      flush();
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, debounceMs);
  };

  const flush = (): RenderResult | undefined => {
    if (aborted) return result;
    clearTimer();
    if (!dirty && result) return result;
    dirty = false;
    try {
      const nextModel = parse(source);
      options.onModel?.(nextModel);
      result?.destroy();
      const nextResult = render(nextModel, {
        ...options.renderOptions,
        target: options.target,
      });
      model = nextModel;
      result = nextResult;
      options.onResult?.(nextResult);
      return nextResult;
    } catch (error) {
      options.onError?.(error);
      if (!options.onError) throw error;
      return result;
    }
  };

  return {
    write(chunk: ArchMapStreamChunk) {
      if (closed) throw new Error("Cannot write to a closed ArchMap stream.");
      if (aborted) return;
      source += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      dirty = true;
      schedule();
    },
    flush,
    async close() {
      if (aborted) return result;
      closed = true;
      source += decoder.decode();
      return flush();
    },
    abort() {
      aborted = true;
      closed = true;
      clearTimer();
      result?.destroy();
      result = undefined;
    },
    async pipe(stream: ReadableStream<ArchMapStreamChunk>) {
      const reader = stream.getReader();
      try {
        while (!aborted) {
          const read = await reader.read();
          if (read.done) break;
          this.write(read.value);
        }
        return await this.close();
      } finally {
        reader.releaseLock();
      }
    },
    getSource() {
      return source;
    },
    getModel() {
      return model;
    },
    getResult() {
      return result;
    },
  };
}
