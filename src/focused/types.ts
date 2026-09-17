/** The deliberately small ArchMap diagram model. Positions use a one-based grid. */
export const DIAGRAM_KINDS = ["system", "layers", "sequence", "screens", "activity"] as const;
export type DiagramKind = typeof DIAGRAM_KINDS[number];
export type DiagramDirection = "LR" | "TD";
export type DiagramColor = "blue" | "green" | "orange" | "purple" | "gray";
export type DiagramShape = "card" | "database" | "decision" | "start" | "end";
export interface DiagramNode {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  at?: [number, number];
  shape: DiagramShape;
  color: DiagramColor;
  line: number;
}
export interface DiagramGroup { id: string; label: string; color: DiagramColor; line: number }
export interface DiagramEdge { from: string; to: string; label: string; style: "solid" | "dashed"; bidirectional: boolean; line: number }
export interface DiagramDiagnostic { line: number; severity: "error" | "warning"; message: string }
export interface DiagramModel {
  kind: DiagramKind;
  direction: DiagramDirection;
  style?: "cards" | "icons";
  title: string;
  nodes: DiagramNode[];
  groups: DiagramGroup[];
  edges: DiagramEdge[];
  diagnostics: DiagramDiagnostic[];
}
export interface DiagramBox { x: number; y: number; width: number; height: number }
export interface DiagramPoint { x: number; y: number }
export interface DiagramLayoutNode extends DiagramBox { node: DiagramNode; iconMode?: boolean }
export interface DiagramLayoutEdge { edge: DiagramEdge; points: DiagramPoint[]; labelBox?: DiagramBox }
export interface DiagramLayout {
  width: number;
  height: number;
  nodes: DiagramLayoutNode[];
  groups: Array<DiagramBox & { group: DiagramGroup }>;
  edges: DiagramLayoutEdge[];
}
export interface DiagramRenderResult { svg: string; model: DiagramModel; layout: DiagramLayout; durationMs: number }
export interface DiagramSample { id: DiagramKind; title: string; subtitle: string; source: string }
