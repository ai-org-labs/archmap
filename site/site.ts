import {
  DEFAULT_ARCHMAP_SAMPLES,
  DEFAULT_DIAGRAM_TAG_VIEWS,
  createDiagramTags,
  parse,
  registerIcon,
  render,
  type ArchMapSample,
  type DiagramTagOption,
  type RenderResult,
} from "../src/index.ts";
import "./site.css";

type PageKind = "next" | "playground" | "prototype" | "lifecycle" | "gallery";

async function bootstrap(): Promise<void> {
const page = (document.body.dataset.page ?? "next") as PageKind;
let lifecycleViews: readonly DiagramTagOption[] = [];

if (page !== "gallery") {
  const { installCloudProviderIcons, installFamousServiceIcons } = await import("@archmap/icons");
  installCloudProviderIcons(registerIcon);
  installFamousServiceIcons(registerIcon);
}
if (page === "playground" || page === "lifecycle") {
  const lifecycle = await import("../packages/lifecycle/src/index.ts");
  lifecycle.installLifecycle();
  lifecycleViews = lifecycle.LIFECYCLE_DIAGRAM_TAG_VIEWS;
}
if (page === "playground") {
  const { installThreeView } = await import("../src/views3d/three-view.ts");
  installThreeView();
}

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const deploymentRoot = location.pathname.includes("/archmap/") ? "/archmap/" : "/";
const route = (path = ""): string => `${deploymentRoot}${path}`;
const navItems = [
  ["next", "", "Next"],
  ["playground", "playground/", "Playground"],
  ["gallery", "examples/", "Examples"],
  ["prototype", "prototype/", "Prototype"],
  ["lifecycle", "lifecycle/", "Lifecycle"],
] as const;

function nav(): string {
  return `<header class="topbar"><a class="brand" href="${route()}">ArchMap <span>Next</span></a><nav class="nav" aria-label="Demo sections">${navItems.map(([id, href, label]) => `<a href="${route(href)}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav><span class="version">v0.4.1</span></header>`;
}

const sampleById = (id: string): ArchMapSample | undefined => DEFAULT_ARCHMAP_SAMPLES.find((sample) => sample.id === id);

function samplesForPage(): ArchMapSample[] {
  if (page === "next") return DEFAULT_ARCHMAP_SAMPLES.filter((sample) => sample.id === "next-boundary-crossings");
  if (page === "prototype") return DEFAULT_ARCHMAP_SAMPLES.filter((sample) => sample.recommendation.baseView === "prototype" || sample.category.includes("screenflow") || sample.category.includes("prototype"));
  if (page === "lifecycle") return DEFAULT_ARCHMAP_SAMPLES.filter((sample) => /requirements:|acceptanceCriteria:|tests:|evidence:|risks:/m.test(sample.source));
  return DEFAULT_ARCHMAP_SAMPLES;
}

function initialSample(samples: ArchMapSample[]): ArchMapSample {
  const requested = new URLSearchParams(location.search).get("sample");
  return (requested && sampleById(requested)) || samples[0] || DEFAULT_ARCHMAP_SAMPLES[0];
}

function renderGallery(): void {
  document.body.innerHTML = `<div class="app">${nav()}<main class="gallery"><section class="gallery-head"><p class="eyebrow">Example gallery</p><h1>Choose the diagram for the question</h1><p>Every example uses the same ArchMap DSL and Core renderer. The recommendation opens in the full Playground so the source, diagnostics, View, and overlays remain inspectable.</p></section><section class="gallery-grid">${DEFAULT_ARCHMAP_SAMPLES.map((sample) => `<a class="sample-card" href="${route(`playground/?sample=${encodeURIComponent(sample.id)}`)}"><span class="category">${sample.category}</span><h2>${sample.title}</h2><p>${sample.description}</p><div class="sample-meta"><span class="pill">${sample.recommendation.baseView}</span><span class="pill">${sample.recommendation.renderMode}</span><span class="pill">${sample.recommendation.overlays.length} overlays</span></div></a>`).join("")}</section></main></div>`;
}

if (page === "gallery") {
  renderGallery();
} else {
  const samples = samplesForPage();
  const first = initialSample(samples);
  const focused = page !== "playground";
  const pageCopy = page === "next"
    ? ["System Topology as Code", "Boundary crossings", "Direct Resource communication with derived Container Crossings and Overlay Transitions."]
    : page === "prototype"
      ? ["ScreenFlow", "Interactive prototype", "Inspect the screen map and play authored scenarios without mixing it with architecture analysis."]
      : page === "lifecycle"
        ? ["Lifecycle extension", "Requirements to evidence", "Preview Requirements, Traceability, and Quality projections installed by @archmap/lifecycle."]
        : ["DSL workbench", "Playground", "Edit source, switch every View, inspect diagnostics, and export the result."];

  document.body.innerHTML = `<div class="app">${nav()}<main class="workspace${focused ? " is-focused" : ""}"><aside class="sidebar"><div class="sidebar-head"><p class="eyebrow">${pageCopy[0]}</p><h1>${pageCopy[1]}</h1><p class="sidebar-copy">${pageCopy[2]}</p></div><div class="controls"><label for="sample-select">Sample</label><select id="sample-select"></select>${focused ? "" : '<button class="primary" id="render-button">Render</button>'}</div>${focused ? '<div class="summary" id="summary"></div>' : '<div class="source-wrap"><pre class="line-numbers" id="line-numbers" aria-hidden="true"></pre><textarea id="source" spellcheck="false"></textarea></div><div class="diagnostics" id="diagnostics"></div>'}</aside><section class="canvas"><div class="canvas-toolbar" id="diagram-tags"></div><div class="loading" id="loading">Rendering</div><div id="diagram"></div></section></main></div>`;

  const select = byId<HTMLSelectElement>("sample-select");
  for (const sample of samples) {
    const option = document.createElement("option");
    option.value = sample.id;
    option.textContent = sample.title;
    select.append(option);
  }
  select.value = first.id;

  let activeSample = first;
  let result: RenderResult | null = null;
  let tags: ReturnType<typeof createDiagramTags> | null = null;
  let abstractionLocked = false;
  let fitted = false;
  const source = focused ? null : byId<HTMLTextAreaElement>("source");
  const pageState = (sample: ArchMapSample) => ({
    ...sample.recommendation,
    baseView: page === "next"
      ? "topology"
      : page === "prototype"
        ? "prototype"
        : page === "lifecycle"
          ? "requirements"
          : sample.recommendation.baseView,
  });
  const views = page === "prototype"
    ? DEFAULT_DIAGRAM_TAG_VIEWS.filter((view) => view.value === "prototype")
    : page === "lifecycle"
      ? [...lifecycleViews]
      : page === "next"
        ? DEFAULT_DIAGRAM_TAG_VIEWS.filter((view) => view.value === "overview" || view.value === "topology")
        : [...DEFAULT_DIAGRAM_TAG_VIEWS, ...lifecycleViews];

  function currentSource(): string {
    const value = source?.value ?? activeSample.source;
    return page === "prototype"
      ? value.replaceAll("./screens/", route("examples/screens/"))
      : value;
  }
  function updateLines(): void {
    if (!source) return;
    byId("line-numbers").textContent = Array.from({ length: Math.max(1, source.value.split("\n").length) }, (_, index) => index + 1).join("\n");
  }
  function updateDetails(): void {
    if (!focused) return;
    const model = result?.model;
    const errorCount = model?.errors.length ?? 0;
    const warningCount = model?.warnings.length ?? 0;
    const state = pageState(activeSample);
    byId("summary").innerHTML = `<section class="summary-section"><h2>Projection</h2><dl><dt>View</dt><dd>${state.baseView}</dd><dt>Mode</dt><dd>${state.renderMode.toUpperCase()}</dd><dt>Nodes</dt><dd>${model?.nodes.length ?? 0}</dd><dt>Edges</dt><dd>${model?.edges.length ?? 0}</dd></dl></section><section class="summary-section"><h2>Signals</h2><ul class="signal-list">${page === "next" ? "<li>Container membership is structural.</li><li>Crossings are derived, never authored.</li><li>Overlay membership may overlap.</li>" : page === "prototype" ? "<li>Map shows authored transitions.</li><li>Play follows the selected scenario.</li><li>Hotspots stay tied to screen coordinates.</li>" : "<li>Requirements stay connected to architecture.</li><li>Quality evidence remains a separate extension.</li><li>Views project one canonical model.</li>"}</ul></section><section class="summary-section"><h2>Diagnostics</h2><dl><dt>Errors</dt><dd>${errorCount}</dd><dt>Warnings</dt><dd>${warningCount}</dd></dl></section>`;
  }
  function updateDiagnostics(): void {
    if (focused || !result) return;
    const diagnostics = [...result.model.errors, ...result.model.warnings];
    byId("diagnostics").innerHTML = diagnostics.length ? diagnostics.map((item) => `<div class="${item.level === "error" ? "error" : "warn"}">${item.level === "error" ? "x" : "!"} ${item.code}: ${item.message}</div>`).join("") : '<div class="ok">No diagnostics</div>';
  }
  function showLoading(): void { byId("loading").style.display = "flex"; }
  function hideLoading(): void { byId("loading").style.display = "none"; }
  function withLoading(action: () => void): void {
    showLoading();
    requestAnimationFrame(() => requestAnimationFrame(() => { try { action(); } finally { requestAnimationFrame(hideLoading); } }));
  }
  function selectedState() {
    return tags?.getState() ?? pageState(activeSample);
  }
  function buildTags(): void {
    const previous = selectedState();
    tags?.destroy();
    tags = createDiagramTags({
      target: byId("diagram-tags"),
      views,
      renderModes: page === "playground" ? undefined : [{ value: "2d", label: "2D" }],
      state: { ...previous, abstractionLocked },
      actions: ["fit", "lock", "download", "fullscreen"],
      onChange: (_state, event) => {
        withLoading(() => {
          if (!result) return;
          if (event.kind === "baseView") result.setBaseView(event.value);
          if (event.kind === "renderMode") result.setRenderMode(event.value);
          if (event.kind === "overlay") event.checked ? result.addOverlay(event.value) : result.removeOverlay(event.value);
          updateDiagnostics();
        });
      },
      onAction: (action) => {
        if (!result) return;
        if (action === "fit") { fitted ? result.reset() : result.fit(); fitted = !fitted; }
        if (action === "lock") { abstractionLocked = !abstractionLocked; result.setAbstractionLocked(abstractionLocked); }
        if (action === "download") void result.downloadPng("archmap.png");
        if (action === "fullscreen") document.querySelector(".canvas")?.requestFullscreen();
      },
    });
  }
  function draw(): void {
    result?.destroy();
    const state = selectedState();
    const model = parse(currentSource());
    result = render(model, {
      baseView: state.baseView,
      renderMode: state.renderMode,
      overlays: state.overlays,
      abstractionLocked,
      target: byId("diagram"),
    });
    updateDiagnostics();
    updateDetails();
  }
  function applySample(sample: ArchMapSample): void {
    activeSample = sample;
    if (source) source.value = sample.source;
    fitted = false;
    abstractionLocked = false;
    tags?.setState({ ...pageState(sample), abstractionLocked });
    updateLines();
    draw();
  }

  if (source) {
    source.value = first.source;
    source.addEventListener("input", updateLines);
    source.addEventListener("scroll", () => { byId("line-numbers").scrollTop = source.scrollTop; });
    byId("render-button").addEventListener("click", () => withLoading(draw));
    updateLines();
  }
  select.addEventListener("change", () => {
    const next = sampleById(select.value);
    if (next) withLoading(() => applySample(next));
  });
  byId("diagram").addEventListener("archmap:prototype-render-state", (event) => {
    const state = (event as CustomEvent).detail?.state;
    if (state === "loading") showLoading();
    if (state === "ready") hideLoading();
  });
  buildTags();
  draw();
}
}

void bootstrap();
