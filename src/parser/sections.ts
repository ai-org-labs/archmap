/**
 * Splitting an ArchMap document into its graph and metadata sections (§4),
 * and extracting ```archmap blocks from Markdown (§5).
 */

export interface Sections {
  graph: string;
  /** Raw YAML text after the first `---` separator, or "" if none. */
  metadata: string;
}

/**
 * Split on the first line that is exactly `---`. Everything before is the
 * graph section; everything after is YAML metadata. A document with no
 * separator is treated as graph-only.
 */
export function splitSections(source: string): Sections {
  const lines = source.split(/\r?\n/);
  const sepIndex = lines.findIndex((line) => line.trim() === "---");
  if (sepIndex === -1) {
    return { graph: source, metadata: "" };
  }
  return {
    graph: lines.slice(0, sepIndex).join("\n"),
    metadata: lines.slice(sepIndex + 1).join("\n"),
  };
}

/**
 * Extract the contents of every ```archmap fenced code block from a Markdown
 * string, in document order. Used by the browser runtime to scan a page.
 */
export function extractArchMapBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  // Match a fence open with the `archmap` info string, capture until the
  // matching closing fence of the same length.
  const fence = /^([ \t]*)(`{3,}|~{3,})[ \t]*archmap[ \t]*$\r?\n([\s\S]*?)^\1\2[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(markdown)) !== null) {
    blocks.push(m[3]);
  }
  return blocks;
}
