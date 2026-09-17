import { parseDiagram } from "../src/focused/parser.js";
import { renderDiagram } from "../src/focused/render.js";
import { DIAGRAM_SAMPLES } from "../src/focused/samples.js";
import { installDiagramIcons, getDiagramIconCatalog } from "../src/focused/icons.js";
import { getIcon } from "../src/icons.js";
import type { DiagramRenderResult, DiagramSample } from "../src/focused/types.js";
import syntaxSource from "../docs/SYNTAX.md?raw";
import promptInstructions from "../docs/AI_PROMPT_TEMPLATE.md?raw";
import "./site.css";

type PageKind = "home" | "playground" | "syntax" | "examples";
const page = (document.body.dataset.page || "home") as PageKind;
const standalone = document.body.dataset.standalone === "true";
const base = page === "home" || standalone ? "./" : "../";
const route = (path = "") => `${base}${path}`;
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const icons: Record<string, string> = {
  arrow: '<path d="M4 10h12m-5-5 5 5-5 5"/>',
  download: '<path d="M10 3v10m-4-4 4 4 4-4M4 13v4h12v-4"/>',
  upload: '<path d="M10 13V3m-4 4 4-4 4 4M4 13v4h12v-4"/>',
  reset: '<path d="M4 7a7 7 0 1 1 0 6M4 3v5h5"/>',
  fit: '<path d="M7 3H3v4m10-4h4v4M3 13v4h4m6 0h4v-4"/>',
  code: '<path d="m6 5-4 5 4 5m8-10 4 5-4 5m-3-12-2 14"/>',
  check: '<path d="m4 10 4 4 8-8"/>',
  system: '<rect x="7" y="2" width="6" height="5" rx="1"/><rect x="2" y="13" width="6" height="5" rx="1"/><rect x="12" y="13" width="6" height="5" rx="1"/><path d="M10 7v3H5v3m5-3h5v3"/>',
  layers: '<path d="m2 6 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4M2 14l8 4 8-4"/>',
  sequence: '<path d="M4 2v16M16 2v16M4 6h12m-3-3 3 3-3 3M16 14H4m3-3-3 3 3 3"/>',
  screens: '<rect x="2" y="3" width="6" height="11" rx="1"/><rect x="12" y="6" width="6" height="11" rx="1"/><path d="M8 9h4M4 11h2m8 3h2"/>',
  activity: '<circle cx="4" cy="4" r="2"/><path d="M4 6v4h6m0-4 4 4-4 4-4-4 4-4Zm0 8v3h5"/><circle cx="17" cy="17" r="2"/>',
};
const icon = (name: string, cls = "") => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.code}</svg>`;
const mark = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="7" fill="currentColor"/><path d="M7 20 13 7h2l6 13h-4l-3-7-3 7H7Z" fill="#fff"/><path d="M9 18h10" stroke="#fff" stroke-width="2"/></svg>';

function nav(): string {
  const navItems = [["home", "", "Overview"], ["playground", "playground/", "Playground"], ["syntax", "syntax/", "Syntax"], ["examples", "examples/", "Examples"]];
  return `<a class="skip-link" href="#main">本文へ移動</a><header class="topbar"><a class="brand" href="${standalone ? "#main" : route()}">${mark}<span>archmap<span class="brand-dot">.</span></span></a>${standalone ? '<span class="offline-badge">OFFLINE PLAYGROUND</span>' : `<nav class="nav" aria-label="メインナビゲーション">${navItems.map(([id, href, label]) => `<a href="${route(href)}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav><a class="github-link" href="https://github.com/ai-org-labs/archmap" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>`}</header>`;
}
function footer(): string { return `<footer class="footer"><a class="brand" href="${route()}">${mark}<span>archmap.</span></a><p>Less drawing. More clarity.</p><span>Open source · Browser native</span></footer>`; }
function renderSource(source: string): DiagramRenderResult { return renderDiagram(parseDiagram(source)); }
function diagramSvg(sample: DiagramSample): string {
  try { return renderSource(sample.source).svg; } catch { return '<p class="empty-preview">プレビューを準備しています</p>'; }
}
function sampleTabs(active: string): string { return DIAGRAM_SAMPLES.map(sample => `<button type="button" class="diagram-tab" data-sample="${sample.id}" aria-pressed="${sample.id === active}">${icon(sample.id)}<span>${escapeHtml(sample.title)}</span></button>`).join(""); }

function home(): void {
  const sample = DIAGRAM_SAMPLES[0];
  document.body.innerHTML = `${nav()}<main id="main"><section class="hero wrap"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> ARCHITECTURE, MADE CLEAR</p><h1>構造が伝わる。<br><span>思考が進む。</span></h1><p class="hero-description">テキストから、読みやすい設計図へ。<br>整ったグリッドと余白が、システムのつながりを明快に。</p><div class="hero-actions"><a class="button primary" href="${route("playground/")}">Playground で描く ${icon("arrow")}</a><a class="text-link" href="${route("syntax/")}">記述シンタックスを見る <span aria-hidden="true">↗</span></a></div><div class="hero-facts"><span>${icon("check")} ブラウザだけで動作</span><span>${icon("check")} 登録不要</span><span>${icon("check")} オープンソース</span></div></div><div class="hero-note"><span class="note-line"></span><p>Designed for<br><strong>understanding.</strong></p><small>構成から、ふるまいまで。<br>必要な 5 つの図に集中。</small></div></section><section class="showcase wrap" aria-label="ダイアグラムのプレビュー"><div class="showcase-top"><span><span class="status-dot"></span> LIVE PREVIEW</span><a id="preview-open" href="${route(`playground/?sample=${sample.id}`)}">この図を編集 ${icon("arrow")}</a></div><div class="diagram-tabs" id="home-tabs">${sampleTabs(sample.id)}</div><div class="hero-diagram dot-grid" id="hero-diagram">${diagramSvg(sample)}</div><div class="showcase-bottom"><span id="sample-caption">${escapeHtml(sample.subtitle)}</span><span class="mono">TEXT → GRID → CLARITY</span></div></section><section class="principles wrap"><div class="section-intro"><p class="eyebrow">A SMALLER TOOL. A CLEARER PICTURE.</p><h2>描くことより、<br>伝わることに。</h2></div><div class="principle"><span class="principle-number">01 / LAYOUT</span><h3>線と文字に、居場所を。</h3><p>グリッドで揃える配置。ノードを避ける直交コネクタ。読み進めやすい、静かなレイアウト。</p></div><div class="principle"><span class="principle-number">02 / EXPRESSION</span><h3>少ない構文で、十分に。</h3><p>ノード、接続、グループ。共通の小さな構文で、構成図からアクティビティ図まで表現。</p></div><div class="principle"><span class="principle-number">03 / PORTABILITY</span><h3>あなたの手元で完結。</h3><p>ソースはブラウザで処理。SVG・PNG に書き出し、単体 HTML ならオフラインでも編集できます。</p></div></section><section class="type-section wrap"><div class="section-heading"><div><p class="eyebrow">FIVE WAYS TO SEE THE WHOLE</p><h2>設計に必要な、5 つの視点。</h2></div><a class="text-link" href="${route("examples/")}">すべてのサンプル ${icon("arrow")}</a></div><div class="type-grid">${DIAGRAM_SAMPLES.map((s, index) => `<a class="type-card" href="${route(`playground/?sample=${s.id}`)}"><span class="type-icon">${icon(s.id)}</span><span class="type-index">0${index + 1}</span><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.subtitle)}</p><span class="type-code">${s.id} ${icon("arrow")}</span></a>`).join("")}</div></section><section class="closing wrap"><div><p class="eyebrow">START WITH A FEW LINES</p><h2>次のアイデアを、見える形に。</h2></div><a class="button primary" href="${route("playground/")}">図を描きはじめる ${icon("arrow")}</a></section></main>${footer()}`;
  $("home-tabs").addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-sample]");
    const next = DIAGRAM_SAMPLES.find(s => s.id === button?.dataset.sample); if (!next) return;
    $("hero-diagram").innerHTML = diagramSvg(next);
    $("sample-caption").textContent = next.subtitle;
    ($("preview-open") as HTMLAnchorElement).href = route(`playground/?sample=${next.id}`);
    document.querySelectorAll(".diagram-tab").forEach(tab => tab.setAttribute("aria-pressed", String((tab as HTMLElement).dataset.sample === next.id)));
  });
}

function gallery(): void {
  document.body.innerHTML = `${nav()}<main id="main" class="wrap examples-main"><header class="page-heading"><p class="eyebrow">THE EXAMPLE COLLECTION</p><h1>5 つの視点。<br><span>ここから、あなたの設計へ。</span></h1><p>動くサンプルを開いて、テキストを編集してみましょう。</p></header><div class="example-grid">${DIAGRAM_SAMPLES.map((s, index) => `<a class="example-card" href="${route(`playground/?sample=${s.id}`)}"><div class="example-preview dot-grid">${diagramSvg(s)}</div><div class="example-copy"><span class="eyebrow">0${index + 1} / ${s.id.toUpperCase()}</span><h2>${escapeHtml(s.title)} ${icon("arrow")}</h2><p>${escapeHtml(s.subtitle)}</p></div></a>`).join("")}</div></main>${footer()}`;
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>').replace(/\[([^\]]+)\]\(\.\/([\w.-]+\.md)\)/g, (_match, label: string, file: string) => `<a href="${standalone ? 'https://ai-org-labs.github.io/archmap/' : route()}docs/${file}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`);
}
function markdownCells(row: string): string[] {
  const cells: string[] = []; let value = ""; let inCode = false;
  const line = row.trim().replace(/^\||\|$/g, "");
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\\" && line[i + 1] === "|") { value += "|"; i++; continue; }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) { cells.push(value.trim()); value = ""; } else value += char;
  }
  cells.push(value.trim()); return cells;
}
function markdown(text: string): { body: string; toc: string } {
  const lines = text.replace(/\r/g, "").split("\n"); const html: string[] = []; const toc: string[] = []; let i = 0; let heading = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim(); const block: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) block.push(lines[i++]);
      html.push(`<div class="code-block"><span class="code-language">${escapeHtml(lang || "text")}</span><pre><code>${escapeHtml(block.join("\n"))}</code></pre></div>`); i++; continue;
    }
    const h = /^(#{1,4}) (.+)/.exec(line);
    if (h) { const level = h[1].length; const id = `section-${heading++}`; html.push(`<h${level} id="${id}">${inlineMarkdown(h[2])}</h${level}>`); if (level === 2) toc.push(`<a href="#${id}">${escapeHtml(h[2])}</a>`); i++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { const cells = markdownCells(lines[i++]); if (cells.every(s => /^:?-+:?$/.test(s))) continue; rows.push(cells); }
      html.push(`<div class="table-scroll"><table><thead><tr>${(rows.shift() || []).map(c => `<th>${inlineMarkdown(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(c => `<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue;
    }
    if (/^\s*[-*] /.test(line)) { const items: string[] = []; while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(`<li>${inlineMarkdown(lines[i++].replace(/^\s*[-*] /, ""))}</li>`); html.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\d+\. /.test(line)) { const items: string[] = []; while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(`<li>${inlineMarkdown(lines[i++].replace(/^\d+\. /, ""))}</li>`); html.push(`<ol>${items.join("")}</ol>`); continue; }
    if (/^---+$/.test(line)) { html.push("<hr>"); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||[-*] |\d+\. )/.test(lines[i])) paragraph.push(lines[i++]);
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }
  return { body: html.join(""), toc: toc.join("") };
}
const catalogMarkup = `<div class="catalog-tools"><label for="icon-filter">アイコンを検索</label><input type="search" id="icon-filter" placeholder="例: aws, database, github" autocomplete="off"><span id="icon-count"></span></div><div id="icon-catalog-list" class="icon-catalog"></div><button type="button" id="icon-show-more" class="button small catalog-more">さらに表示</button>`;
function mountCatalog(): void {
  const catalog = getDiagramIconCatalog(); let limit = 60;
  function filterIcons(): void {
    const query = $<HTMLInputElement>("icon-filter").value.trim().toLowerCase();
    const items = catalog.filter(item => `${item.key} ${item.label}`.toLowerCase().includes(query));
    $("icon-count").textContent = `${Math.min(limit, items.length)} / ${items.length} icons`;
    $("icon-catalog-list").innerHTML = items.slice(0, limit).map(item => {
      const artwork = getIcon(item.key);
      const preview = artwork ? `<svg class="catalog-icon" viewBox="${escapeHtml(artwork.viewBox)}" aria-hidden="true">${artwork.body}</svg>` : icon("code", "catalog-icon");
      return `<div class="catalog-item">${preview}<div><span>${escapeHtml(item.label)}</span><code>${escapeHtml(item.key)}</code></div></div>`;
    }).join("") || '<p>一致するアイコンがありません。</p>';
    $("icon-show-more").hidden = items.length <= limit;
  }
  $("icon-filter").addEventListener("input", () => { limit = 60; filterIcons(); });
  $("icon-show-more").addEventListener("click", () => { limit += 60; filterIcons(); });
  filterIcons();
}
// Include the canonical reference so the copied prompt follows syntax updates.
const authoringPrompt = `${promptInstructions.trim()}\n\n${syntaxSource.trim()}\n`;
function promptMarkup(): string {
  return `<section id="ai-prompt" class="prompt-card" aria-labelledby="prompt-heading"><p class="eyebrow">DESCRIBE IT. GENERATE IT.</p><h2 id="prompt-heading">AI 用プロンプトテンプレート</h2><p>テンプレートをコピーして、ChatGPT などの AI に貼り付けてください。「作成する図の要件」を書き換えると、ArchMap の構文に沿ったコードを依頼できます。5 種類の図のルールと、下記の構文リファレンス全文を含みます。</p><div class="prompt-actions"><button type="button" id="copy-prompt" class="button primary">プロンプトをコピー</button><button type="button" id="download-prompt" class="button small">${icon("download")} .txt を保存</button></div><p id="prompt-status" class="prompt-status" role="status" aria-live="polite"></p><details id="prompt-details"><summary>テンプレートの全文を見る</summary><label class="prompt-label" for="prompt-source">AI に渡すプロンプト（要件を書き換えて利用）</label><textarea id="prompt-source" class="prompt-source" readonly spellcheck="false">${escapeHtml(authoringPrompt)}</textarea></details></section>`;
}
function mountPrompt(): void {
  $("copy-prompt").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(authoringPrompt);
      $("prompt-status").textContent = "コピーしました。AI に貼り付けて、図の要件を書き換えてください。";
    } catch {
      $<HTMLDetailsElement>("prompt-details").open = true;
      const source = $<HTMLTextAreaElement>("prompt-source"); source.focus(); source.select();
      $("prompt-status").textContent = "自動コピーできませんでした。選択された全文を ⌘ / Ctrl + C でコピーするか、.txt を保存してください。";
    }
  });
  $("download-prompt").addEventListener("click", () => {
    download(new Blob([authoringPrompt], { type: "text/plain;charset=utf-8" }), "archmap-ai-prompt.txt");
    $("prompt-status").textContent = "プロンプトを保存しました。";
  });
}
function syntax(): void {
  const reference = markdown(syntaxSource);
  document.body.innerHTML = `${nav()}<main id="main" class="wrap reference-main"><header class="page-heading"><p class="eyebrow">ONE SMALL LANGUAGE</p><h1>記述シンタックス<span class="heading-dot">.</span></h1><p>すべての図に、ひとつの共通構文。定義と実例を、ここに。</p></header><div class="reference-layout"><aside class="reference-nav"><p class="eyebrow">ON THIS PAGE</p><nav aria-label="シンタックスの目次"><a href="#ai-prompt">AI 用プロンプト</a>${reference.toc}<a href="#icon-catalog">利用できるアイコン</a></nav><a class="button small" href="${route("playground/")}">コードを試す ${icon("arrow")}</a></aside><article class="reference-article">${promptMarkup()}${reference.body}<h2 id="icon-catalog">利用できるアイコン</h2><p><code>icon=キー</code> で指定します。以下はこの Playground に組み込まれたアイコンです。</p>${catalogMarkup}</article></div></main>${footer()}`;
  mountCatalog();
  mountPrompt();
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function playground(): void {
  document.body.classList.add("playground-page");
  let active = DIAGRAM_SAMPLES.find(sample => sample.id === new URLSearchParams(location.search).get("sample")) || DIAGRAM_SAMPLES[0];
  let result: DiagramRenderResult | null = null; let timer = 0; let zoom = 1; let fitMode = true; let currentValid = false;
  document.body.innerHTML = `${nav()}<main id="main" class="playground"><div class="workbench-heading"><div><span class="eyebrow">YOUR DIAGRAM WORKSPACE</span><h1>Playground<span class="heading-dot">.</span></h1></div><div class="workbench-actions"><span class="privacy-note"><span class="status-dot"></span> ブラウザ内で処理</span>${standalone ? '<span class="offline-badge">オフライン版</span>' : `<button type="button" id="offline-export" class="button small">${icon("download")} オフライン版</button>`}</div></div><div class="workbench"><section class="editor-panel" aria-label="ソースエディタ"><div class="editor-controls"><label for="sample-select">図の種類</label><select id="sample-select">${DIAGRAM_SAMPLES.map(sample => `<option value="${sample.id}">${escapeHtml(sample.title)}</option>`).join("")}</select><button class="icon-button" id="reset-source" title="サンプルに戻す" aria-label="現在の図をサンプルに戻す">${icon("reset")}</button></div><div class="editor-file"><span>${icon("code")} <span id="source-filename">${active.id}.archmap</span></span><span class="editor-language">ARCHMAP</span></div><div class="source-wrap"><pre id="line-numbers" class="line-numbers" aria-hidden="true"></pre><textarea id="source" aria-label="ArchMap ソースコード" aria-describedby="editor-hint" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea></div><div class="editor-bottom"><span id="draft-status" role="status"></span><span id="line-count"></span></div><div class="editor-hint" id="editor-hint"><span>入力すると自動でプレビュー</span><kbd>⌘ / Ctrl ↵</kbd></div><div class="diagnostics" id="diagnostics" role="status" aria-live="polite"></div><div class="editor-actions"><button class="button small" id="import-source">${icon("upload")} 読み込み</button><button class="button small" id="download-source">${icon("download")} ソース</button><input type="file" id="source-file" accept=".archmap,.txt,text/plain" hidden>${standalone ? '<button type="button" id="offline-guide" class="syntax-shortcut">構文ガイド ↗</button>' : `<a href="${route("syntax/")}" class="syntax-shortcut" target="_blank" rel="noopener">構文ガイド ↗</a>`}</div></section><section class="preview-panel" aria-label="図のプレビュー"><div class="preview-toolbar"><div class="preview-label"><span class="status-dot"></span> PREVIEW <span id="render-time"></span></div><div class="export-actions"><label class="style-picker" for="diagram-style">表示 <select id="diagram-style"><option value="cards">カード</option><option value="icons">アイコン</option></select></label><button class="button small" id="download-svg">${icon("download")} SVG</button><button class="button small" id="download-png">${icon("download")} PNG</button></div></div><div class="preview-canvas dot-grid" id="preview-canvas" tabindex="0" aria-label="プレビューキャンバス。ズーム後はスクロールできます。"><div id="diagram-frame"><div id="diagram"></div></div><div id="preview-empty" class="preview-empty" hidden>有効なコードを入力すると、ここに図が表示されます。</div></div><div class="preview-bottom"><span id="diagram-summary"></span><div class="zoom-controls"><button id="zoom-out" aria-label="縮小" title="縮小">−</button><button id="zoom-value" aria-label="100% で表示">100%</button><button id="zoom-in" aria-label="拡大" title="拡大">＋</button><span class="control-divider"></span><button id="fit-diagram" aria-label="図全体を表示" title="図全体を表示">${icon("fit")} <span>Fit</span></button></div></div></section></div><div class="workspace-caption"><span>Text in. Clarity out.</span><span id="action-status" role="status" aria-live="polite">ソースはサーバーに送信されません。</span></div></main>`;
  const source = $<HTMLTextAreaElement>("source"); const select = $<HTMLSelectElement>("sample-select"); const canvas = $("preview-canvas");
  const storageKey = () => `archmap:focused:${active.id}`;
  const announce = (message: string) => { $("action-status").textContent = message; };
  function loadDraft(): string {
    try { const draft = localStorage.getItem(storageKey()); $("draft-status").textContent = draft === null ? "サンプル" : "ローカルの下書きを復元"; return draft ?? active.source; }
    catch { $("draft-status").textContent = "一時セッション"; return active.source; }
  }
  function saveDraft(): void { try { localStorage.setItem(storageKey(), source.value); $("draft-status").textContent = "この端末に保存済み"; } catch { $("draft-status").textContent = "自動保存できません · ソースを書き出せます"; } }
  function updateLines(): void { const count = source.value.split("\n").length; $("line-numbers").textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n"); $("line-count").textContent = `${count} lines`; $("line-numbers").scrollTop = source.scrollTop; }
  function setZoom(value: number): void {
    zoom = Math.max(.12, Math.min(3, value)); if (!result) return;
    const diagram = $("diagram"); const width = result.layout.width * zoom; const height = result.layout.height * zoom;
    diagram.style.width = `${result.layout.width}px`; diagram.style.height = `${result.layout.height}px`; diagram.style.transform = `scale(${zoom})`;
    $("diagram-frame").style.width = `${width}px`; $("diagram-frame").style.height = `${height}px`;
    $("zoom-value").textContent = `${Math.round(zoom * 100)}%`;
  }
  function fit(): void { fitMode = true; if (!result) return; setZoom(Math.min((canvas.clientWidth - 64) / result.layout.width, (canvas.clientHeight - 64) / result.layout.height, 1.3)); }
  function exportState(valid: boolean): void { currentValid = valid; $<HTMLButtonElement>("download-svg").disabled = !valid; $<HTMLButtonElement>("download-png").disabled = !valid; }
  function draw(): void {
    window.clearTimeout(timer);
    try {
      const model = parseDiagram(source.value); const diagnostics = model.diagnostics;
      const errors = diagnostics.filter(item => item.severity === "error");
      const styleSelect = $<HTMLSelectElement>("diagram-style");
      styleSelect.value = model.style ?? "cards";
      styleSelect.disabled = errors.length > 0 || !["system", "layers"].includes(model.kind);
      styleSelect.title = ["system", "layers"].includes(model.kind) ? "ソースにも保存されます" : "アイコン表示はシステム構成図・レイヤースタック図で利用できます";
      $("diagnostics").classList.toggle("has-errors", errors.length > 0);
      $("diagnostics").innerHTML = diagnostics.length ? diagnostics.map(d => `<button type="button" class="diagnostic ${d.severity}" data-line="${d.line}"><span>${d.severity === "error" ? "!" : "△"}</span><span>${d.line ? `${d.line} 行目 · ` : ""}${escapeHtml(d.message)}</span></button>`).join("") : `<span class="diagnostic-ok">${icon("check")} エラーなし</span>`;
      exportState(errors.length === 0);
      if (errors.length) { $("render-time").textContent = "更新を保留"; $("diagram-summary").textContent = result ? "最後の有効なプレビューを表示中" : "コードを確認してください"; $("preview-empty").hidden = !!result; return; }
      result = renderDiagram(model);
      if (result.model.diagnostics.length) $("diagnostics").innerHTML = result.model.diagnostics.map(d => `<button type="button" class="diagnostic ${d.severity}" data-line="${d.line}"><span>${d.severity === "error" ? "!" : "△"}</span><span>${d.line ? `${d.line} 行目 · ` : ""}${escapeHtml(d.message)}</span></button>`).join("");
      $("diagram").innerHTML = result.svg; $("preview-empty").hidden = true;
      $("render-time").textContent = `${result.durationMs.toFixed(1)} ms`;
      $("diagram-summary").textContent = `${model.nodes.length} nodes · ${model.edges.length} connections`;
      if (fitMode) fit(); else setZoom(zoom);
    } catch (error) {
      exportState(false); $("diagnostics").textContent = error instanceof Error ? error.message : "描画できませんでした。コードを確認してください。"; $("diagnostics").classList.add("has-errors"); $("render-time").textContent = "更新を保留"; $("diagram-summary").textContent = result ? "最後の有効なプレビューを表示中" : "コードを確認してください"; $("preview-empty").hidden = !!result;
    }
  }
  function applySample(): void { source.value = loadDraft(); select.value = active.id; $("source-filename").textContent = `${active.id}.archmap`; fitMode = true; source.scrollTop = 0; updateLines(); draw(); }
  source.addEventListener("input", () => { window.clearTimeout(timer); updateLines(); saveDraft(); timer = window.setTimeout(draw, 300); });
  source.addEventListener("scroll", () => { $("line-numbers").scrollTop = source.scrollTop; });
  source.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); draw(); }
  });
  $("diagram-style").addEventListener("change", () => {
    const style = $<HTMLSelectElement>("diagram-style").value;
    const lines = source.value.split(/\r\n|\n|\r/);
    const declaration = lines.findIndex(line => /^\s*style\s+(cards|icons)\s*(?:(?:#|\/\/).*)?$/.test(line));
    if (declaration >= 0) lines[declaration] = lines[declaration]!.replace(/(style\s+)(cards|icons)/, `$1${style}`);
    else {
      const header = lines.findIndex(line => /^\s*diagram\s/.test(line));
      lines.splice(header + 1, 0, `style ${style}`);
    }
    source.value = lines.join("\n"); saveDraft(); updateLines(); fitMode = true; draw();
    announce(style === "icons" ? "アイコン表示に切り替えました。" : "カード表示に切り替えました。");
  });
  select.addEventListener("change", () => { window.clearTimeout(timer); active = DIAGRAM_SAMPLES.find(sample => sample.id === select.value)!; applySample(); });
  $("reset-source").addEventListener("click", () => { source.value = active.source; saveDraft(); updateLines(); fitMode = true; draw(); announce("現在の図をサンプルに戻しました。"); });
  $("diagnostics").addEventListener("click", event => { const line = Number((event.target as HTMLElement).closest<HTMLElement>("[data-line]")?.dataset.line); if (!line) return; const offset = source.value.split("\n").slice(0, line - 1).reduce((n, s) => n + s.length + 1, 0); source.focus(); source.setSelectionRange(offset, source.value.indexOf("\n", offset) === -1 ? source.value.length : source.value.indexOf("\n", offset)); source.scrollTop = Math.max(0, (line - 4) * 23); });
  $("fit-diagram").addEventListener("click", fit);
  $("zoom-in").addEventListener("click", () => { fitMode = false; setZoom(zoom * 1.2); });
  $("zoom-out").addEventListener("click", () => { fitMode = false; setZoom(zoom / 1.2); });
  $("zoom-value").addEventListener("click", () => { fitMode = false; setZoom(1); });
  new ResizeObserver(() => { if (fitMode) fit(); }).observe(canvas);
  $("download-source").addEventListener("click", () => { download(new Blob([source.value], { type: "text/plain;charset=utf-8" }), `${active.id}.archmap`); announce("ソースを書き出しました。"); });
  $("download-svg").addEventListener("click", () => { draw(); if (!currentValid || !result) return; download(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }), `${active.id}.svg`); announce("SVG を書き出しました。"); });
  $("download-png").addEventListener("click", async () => {
    draw(); if (!currentValid || !result) return;
    const button = $<HTMLButtonElement>("download-png"); button.disabled = true; const snapshot = result; const filename = `${active.id}.png`; const url = URL.createObjectURL(new Blob([snapshot.svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image(); image.src = url; await image.decode(); const png = document.createElement("canvas"); const scale = Math.min(2, 8192 / Math.max(snapshot.layout.width, snapshot.layout.height)); png.width = Math.ceil(snapshot.layout.width * scale); png.height = Math.ceil(snapshot.layout.height * scale); const context = png.getContext("2d"); if (!context) throw new Error("PNG 出力に対応していません。"); context.fillStyle = "#ffffff"; context.fillRect(0, 0, png.width, png.height); context.drawImage(image, 0, 0, png.width, png.height); const blob = await new Promise<Blob>((resolve, reject) => png.toBlob(value => value ? resolve(value) : reject(new Error("PNG の作成に失敗しました。")), "image/png")); download(blob, filename); announce("PNG を書き出しました。");
    } catch (error) { announce(error instanceof Error ? error.message : "PNG の書き出しに失敗しました。"); } finally { URL.revokeObjectURL(url); button.disabled = !currentValid; }
  });
  $("import-source").addEventListener("click", () => $<HTMLInputElement>("source-file").click());
  $("source-file").addEventListener("change", async () => {
    const input = $<HTMLInputElement>("source-file"); const file = input.files?.[0]; if (!file) return;
    if (file.size > 1_000_000) { announce("1 MB 以下のソースファイルを選択してください。"); input.value = ""; return; }
    try { const text = await file.text(); const kind = /^\s*diagram\s+(system|layers|sequence|screens|activity)\b/m.exec(text)?.[1]; const sample = DIAGRAM_SAMPLES.find(s => s.id === kind); if (sample) { active = sample; select.value = sample.id; } source.value = text; $("source-filename").textContent = file.name; fitMode = true; saveDraft(); updateLines(); draw(); announce(`${file.name} を読み込みました。`); } catch { announce("ファイルを読み込めませんでした。"); } finally { input.value = ""; }
  });
  if (!standalone) $("offline-export").addEventListener("click", async () => {
    const button = $<HTMLButtonElement>("offline-export"); button.disabled = true;
    try { const response = await fetch(route("standalone.html")); if (!response.ok) throw new Error(); const html = await response.text(); if (!html.includes('data-standalone="true"')) throw new Error(); download(new Blob([html], { type: "text/html;charset=utf-8" }), "archmap-playground.html"); announce("オフライン版を保存しました。HTML を開くとネット接続なしで利用できます。"); }
    catch { announce("オフライン版を取得できませんでした。サイトのビルドと接続をご確認ください。"); } finally { button.disabled = false; }
  });
  if (standalone) $("offline-guide").addEventListener("click", () => {
    let dialog = document.getElementById("syntax-dialog") as HTMLDialogElement | null;
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "syntax-dialog"; dialog.className = "syntax-dialog";
      dialog.innerHTML = `<div class="dialog-heading"><span class="eyebrow">ARCHMAP SYNTAX</span><button class="button small" id="close-guide" type="button">閉じる <span aria-hidden="true">×</span></button></div><article class="reference-article">${promptMarkup()}${markdown(syntaxSource).body}<h2>利用できるアイコン</h2><p><code>icon=キー</code> で指定します。</p>${catalogMarkup}</article>`;
      document.body.append(dialog); $("close-guide").addEventListener("click", () => dialog!.close()); mountCatalog(); mountPrompt();
    }
    dialog.showModal();
  });
  applySample();
}

installDiagramIcons();
if (page === "playground") playground();
else if (page === "syntax") syntax();
else if (page === "examples") gallery();
else home();
