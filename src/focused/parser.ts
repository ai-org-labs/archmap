import { DIAGRAM_KINDS } from "./types.js";
import type {
  DiagramColor, DiagramDirection, DiagramKind, DiagramModel, DiagramNode, DiagramShape,
} from "./types.js";

/** Keep malformed or generated documents cheap enough to edit in the browser. */
export const DIAGRAM_LIMITS = Object.freeze({
  sourceLength: 50_000,
  nodes: 40,
  edges: 100,
  groups: 12,
  gridCoordinate: 12,
  labelLength: 120,
  descriptionLength: 240,
  diagnostics: 50,
});

type Token = { kind: "word" | "string" | "equals" | "arrow"; value: string };
type Report = (line: number, message: string) => void;
const ID = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const ICON = /^[A-Za-z][A-Za-z0-9_./:-]{0,79}$/;
// Unicode mode treats valid surrogate pairs as one code point, so this also catches
// isolated surrogate halves without rejecting emoji or other supplementary text.
const INVALID_XML_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u;
const COLORS = new Set<DiagramColor>(["blue", "green", "orange", "purple", "gray"]);
const SHAPES = new Set<DiagramShape>(["card", "database", "decision", "start", "end"]);

function arrowAt(source: string, index: number): string | undefined {
  for (const arrow of ["<->", "-->", "->"]) {
    if (source.startsWith(arrow, index)) return arrow;
  }
  return undefined;
}

function tokenize(source: string, line: number, report: Report): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source[index] === "#" || source.startsWith("//", index)) break;
    if (source[index] === '"') {
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const char = source[index++];
        if (char === '"') { closed = true; break; }
        if (char === "\\") {
          const escape = source[index++];
          if (escape === "n") value += "\n";
          else if (escape === '"' || escape === "\\") value += escape;
          else {
            report(line, "文字列で使用できるエスケープは \\n、\\\"、\\\\ です。");
            return undefined;
          }
        } else value += char;
      }
      if (!closed) { report(line, "文字列を閉じるダブルクォートがありません。"); return undefined; }
      if (INVALID_XML_TEXT.test(value)) { report(line, "文字列に SVG/XML で使用できない制御文字または不正な Unicode が含まれています。"); return undefined; }
      tokens.push({ kind: "string", value });
      continue;
    }
    if (source[index] === "=") { tokens.push({ kind: "equals", value: "=" }); index += 1; continue; }
    const arrow = arrowAt(source, index);
    if (arrow) { tokens.push({ kind: "arrow", value: arrow }); index += arrow.length; continue; }
    const start = index;
    while (index < source.length && !/\s/.test(source[index]) &&
      source[index] !== '"' && source[index] !== "=" && source[index] !== "#" &&
      !source.startsWith("//", index) && !arrowAt(source, index)) index += 1;
    tokens.push({ kind: "word", value: source.slice(start, index) });
  }
  return tokens;
}

function options(tokens: Token[], allowed: readonly string[], line: number, report: Report): Map<string, Token> | undefined {
  const result = new Map<string, Token>();
  for (let index = 0; index < tokens.length; index += 3) {
    const key = tokens[index];
    const equals = tokens[index + 1];
    const value = tokens[index + 2];
    if (key.kind !== "word" || equals?.kind !== "equals" || !value || !["word", "string"].includes(value.kind)) {
      report(line, "オプションは key=value の形式で指定してください。");
      return undefined;
    }
    if (!allowed.includes(key.value)) { report(line, `未対応のオプション「${key.value}」です。`); return undefined; }
    if (result.has(key.value)) { report(line, `オプション「${key.value}」が重複しています。`); return undefined; }
    result.set(key.value, value);
  }
  return result;
}

function validLabel(token: Token | undefined, line: number, report: Report, maximum = DIAGRAM_LIMITS.labelLength): token is Token {
  if (token?.kind !== "string") { report(line, "ラベルはダブルクォートで囲んでください。"); return false; }
  if (!token.value.trim()) { report(line, "ラベルを空にすることはできません。"); return false; }
  if (token.value.length > maximum) { report(line, `テキストは ${maximum} 文字以内にしてください。`); return false; }
  return true;
}

/** Parse the complete focused DSL. Invalid user input is returned as diagnostics. */
export function parseDiagram(source: string): DiagramModel {
  const model: DiagramModel = { kind: "system", direction: "LR", title: "", nodes: [], groups: [], edges: [], diagnostics: [] };
  const report: Report = (line, message) => {
    if (model.diagnostics.length < DIAGRAM_LIMITS.diagnostics) model.diagnostics.push({ line, severity: "error", message });
  };
  if (typeof source !== "string") { report(1, "図のソースは文字列で指定してください。"); return model; }
  if (source.length > DIAGRAM_LIMITS.sourceLength) {
    report(1, `ソースは ${DIAGRAM_LIMITS.sourceLength.toLocaleString("en-US")} 文字以内にしてください。`);
    return model;
  }
  const ids = new Set<string>();
  const positions = new Map<string, string>();
  let firstStatement = true;
  let hasHeader = false;
  let hasTitle = false;
  let hasStyle = false;

  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lineIndex + 1;
    const tokens = tokenize(lines[lineIndex], line, report);
    if (!tokens || tokens.length === 0) continue;
    const command = tokens[0].value;
    const isFirstStatement = firstStatement;
    firstStatement = false;
    if (isFirstStatement && (tokens[0].kind !== "word" || command !== "diagram")) {
      report(line, "最初の文で diagram system|layers|sequence|screens|activity を宣言してください。");
    }
    if (tokens[0].kind !== "word") { report(line, "文の先頭にはコマンドまたはノード ID を指定してください。"); continue; }

    if (command === "diagram" && tokens[1]?.kind !== "arrow") {
      if (!isFirstStatement) { report(line, "diagram 宣言は最初に一度だけ指定できます。"); continue; }
      const kind = tokens[1];
      const direction = tokens[2];
      if (tokens.length < 2 || tokens.length > 3 || kind.kind !== "word" || !(DIAGRAM_KINDS as readonly string[]).includes(kind.value)) {
        report(line, "図の種類は system、layers、sequence、screens、activity から選んでください。");
        continue;
      }
      model.kind = kind.value as DiagramKind;
      model.direction = model.kind === "layers" || model.kind === "activity" ? "TD" : "LR";
      hasHeader = true;
      if (direction) {
        if (direction.kind !== "word" || !["LR", "TD"].includes(direction.value)) report(line, "方向は LR または TD で指定してください。");
        else if (model.kind === "sequence" && direction.value !== "LR") report(line, "sequence の参加者は左から右（LR）に配置されます。TD は使用できません。");
        else if (model.kind === "layers" && direction.value !== "TD") report(line, "layers は上から下（TD）にレイヤーを配置します。LR は使用できません。");
        else model.direction = direction.value as DiagramDirection;
      }
      continue;
    }

    if (command === "style" && tokens[1]?.kind !== "arrow") {
      if (hasStyle) { report(line, "style は一度だけ指定できます。"); continue; }
      hasStyle = true;
      if (tokens.length !== 2 || tokens[1].kind !== "word" || !["cards", "icons"].includes(tokens[1].value)) {
        report(line, "style cards または style icons の形式で指定してください。"); continue;
      }
      if (tokens[1].value === "icons" && !["system", "layers"].includes(model.kind)) {
        report(line, "style icons は system と layers で使用できます。"); continue;
      }
      model.style = tokens[1].value as "cards" | "icons";
      continue;
    }

    if (command === "title" && tokens[1]?.kind !== "arrow") {
      if (hasTitle) { report(line, "title は一度だけ指定できます。"); continue; }
      if (tokens.length !== 2) { report(line, 'title "図のタイトル" の形式で指定してください。'); continue; }
      if (!validLabel(tokens[1], line, report)) continue;
      model.title = tokens[1].value;
      hasTitle = true;
      continue;
    }

    if ((command === "node" || command === "group") && tokens[1]?.kind !== "arrow") {
      const id = tokens[1];
      if (!id || id.kind !== "word" || !ID.test(id.value)) {
        report(line, "ID は英字または _ で始め、英数字、_、- のみを使用してください。");
        continue;
      }
      if (ids.has(id.value)) { report(line, `ID「${id.value}」はすでに宣言されています。`); continue; }
      if (!validLabel(tokens[2], line, report)) continue;
      const opts = options(tokens.slice(3), command === "group" ? ["color"] : ["description", "icon", "group", "at", "shape", "color"], line, report);
      if (!opts) continue;
      let invalid = false;
      const reject = (message: string) => { invalid = true; report(line, message); };
      for (const [key, value] of opts) {
        if (key === "description") {
          if (value.kind !== "string") reject('description は description="説明" の形式で指定してください。');
          else if (value.value.length > DIAGRAM_LIMITS.descriptionLength) reject(`description は ${DIAGRAM_LIMITS.descriptionLength} 文字以内にしてください。`);
        } else if (value.kind !== "word") reject(`オプション「${key}」の値にダブルクォートは使用できません。`);
      }
      const color = opts.get("color")?.value ?? "blue";
      if (!COLORS.has(color as DiagramColor)) reject("color は blue、green、orange、purple、gray から選んでください。");
      if (command === "group") {
        if (model.kind === "sequence") reject("sequence では group を使用できません。");
        if (model.groups.length >= DIAGRAM_LIMITS.groups) reject(`グループは ${DIAGRAM_LIMITS.groups} 個まで指定できます。`);
        if (!invalid) {
          ids.add(id.value);
          model.groups.push({ id: id.value, label: tokens[2].value, color: color as DiagramColor, line });
        }
        continue;
      }
      if (model.nodes.length >= DIAGRAM_LIMITS.nodes) reject(`ノードは ${DIAGRAM_LIMITS.nodes} 個まで指定できます。`);
      const shape = opts.get("shape")?.value ?? "card";
      if (!SHAPES.has(shape as DiagramShape)) reject("shape は card、database、decision、start、end から選んでください。");
      const group = opts.get("group")?.value;
      if (group && !ID.test(group)) reject("group には有効なグループ ID を指定してください。");
      const icon = opts.get("icon")?.value;
      if (icon && !ICON.test(icon)) reject("icon には英字で始まる 80 文字以内のアイコンキーを指定してください。英数字、_、-、.、:、/ が使えます。");
      if (icon && ["decision", "start", "end"].includes(shape)) reject("icon を使用できる shape は card と database です。decision、start、end では icon を省略してください。");
      let at: [number, number] | undefined;
      const position = opts.get("at")?.value;
      if (position !== undefined) {
        if (!/^[1-9]\d*,[1-9]\d*$/.test(position)) reject("at は at=列,行 の形式で、1 以上の整数を指定してください。");
        else {
          const [column, row] = position.split(",").map(Number);
          if (column > DIAGRAM_LIMITS.gridCoordinate || row > DIAGRAM_LIMITS.gridCoordinate) reject(`at の列と行は 1〜${DIAGRAM_LIMITS.gridCoordinate} の範囲で指定してください。`);
          else if (positions.has(`${column},${row}`)) reject(`位置 ${column},${row} はノード「${positions.get(`${column},${row}`)}」が使用しています。`);
          else at = [column, row];
        }
      }
      if (model.kind === "sequence") {
        if (opts.has("group")) reject("sequence のノードでは group を使用できません。");
        if (opts.has("at")) reject("sequence のノードでは at を使用できません。宣言順に配置されます。");
        if (shape !== "card") reject("sequence のノードで使用できる shape は card のみです。");
      }
      if (model.kind === "layers" && opts.has("at")) reject("layers のノードでは at を使用できません。レイヤーと宣言順に配置されます。");
      if (!invalid) {
        const node: DiagramNode = { id: id.value, label: tokens[2].value, shape: shape as DiagramShape, color: color as DiagramColor, line };
        if (opts.has("description")) node.description = opts.get("description")!.value;
        if (icon) node.icon = icon;
        if (group) node.group = group;
        if (at) { node.at = at; positions.set(at.join(","), node.id); }
        ids.add(id.value);
        model.nodes.push(node);
      }
      continue;
    }

    if (tokens[1]?.kind === "arrow") {
      const target = tokens[2];
      const label = tokens[3];
      if (!ID.test(command) || !target || target.kind !== "word" || !ID.test(target.value) || tokens.length > 4) {
        report(line, '接続は source -> target "ラベル" の形式で指定してください。');
        continue;
      }
      if (label && !validLabel(label, line, report)) continue;
      if (model.edges.length >= DIAGRAM_LIMITS.edges) { report(line, `接続は ${DIAGRAM_LIMITS.edges} 本まで指定できます。`); continue; }
      model.edges.push({ from: command, to: target.value, label: label?.value ?? "", style: tokens[1].value === "-->" ? "dashed" : "solid", bidirectional: tokens[1].value === "<->", line });
      continue;
    }
    report(line, `未対応の文「${command}」です。diagram、style、title、group、node、接続を使用してください。`);
  }
  if (!hasHeader && firstStatement) report(1, "最初の文で diagram system|layers|sequence|screens|activity を宣言してください。");
  if (hasHeader && model.nodes.length === 0) report(1, "少なくとも 1 個の node を宣言してください。");
  const nodeIds = new Set(model.nodes.map((node) => node.id));
  const groupIds = new Set(model.groups.map((group) => group.id));
  for (const node of model.nodes) {
    if (node.group && !groupIds.has(node.group)) report(node.line, `グループ「${node.group}」が宣言されていません。`);
  }
  for (const edge of model.edges) {
    if (!nodeIds.has(edge.from)) report(edge.line, `接続元のノード「${edge.from}」が宣言されていません。`);
    if (!nodeIds.has(edge.to)) report(edge.line, `接続先のノード「${edge.to}」が宣言されていません。`);
  }
  return model;
}
