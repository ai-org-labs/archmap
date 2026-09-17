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
export interface DiagramGroup { id: string; label: string; color: DiagramColor; line: number; parent?: string }
export interface DiagramEdge { from: string; to: string; label: string; style: "solid" | "dashed"; bidirectional: boolean; line: number }
export interface DiagramFragmentEvent { action: "alt" | "opt" | "loop" | "else" | "end"; label: string; afterEdge: number; line: number }
export interface DiagramActivationEvent { action: "activate" | "deactivate"; node: string; afterEdge: number; line: number }
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
  activationEvents?: DiagramActivationEvent[];
  fragmentEvents?: DiagramFragmentEvent[];
}
export interface DiagramBox { x: number; y: number; width: number; height: number }
export interface DiagramPoint { x: number; y: number }
export interface DiagramScreenContent {
  title: string[];
  description: string[];
  headerHeight: number;
  height: number;
  actions: Array<{ edge: DiagramEdge; label: string; lines: string[]; top: number; height: number }>;
}
export interface DiagramLayoutNode extends DiagramBox { node: DiagramNode; iconMode?: boolean; screen?: DiagramScreenContent }
export interface DiagramLayoutEdge { edge: DiagramEdge; points: DiagramPoint[]; labelBox?: DiagramBox }
export interface DiagramLayout {
  width: number;
  height: number;
  nodes: DiagramLayoutNode[];
  groups: Array<DiagramBox & { group: DiagramGroup }>;
  edges: DiagramLayoutEdge[];
  fragments?: Array<DiagramBox & { kind: "alt" | "opt" | "loop"; label: string; line: number; depth: number; headerHeight: number; branches: Array<{ label: string; y: number; height: number }> }>;
  activations?: Array<DiagramBox & { node: string; depth: number; line: number }>;
}
export interface DiagramRenderResult { svg: string; model: DiagramModel; layout: DiagramLayout; durationMs: number }
export interface DiagramSample { id: DiagramKind; title: string; subtitle: string; source: string }
