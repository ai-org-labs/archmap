import type { ArchEdge, ArchMapModel, ArchNode, DataObject, Diagnostic, Scenario } from "../types.js";
import type { MountableView, ViewContext, ViewHandle } from "../render.js";

const SCREEN_KINDS = new Set([
  "screen", "page", "modal", "webview", "form", "external_page", "error_screen", "completion_screen",
]);

function isScreenNode(node: ArchNode): boolean {
  return !!node.image || (node.kind !== undefined && SCREEN_KINDS.has(node.kind));
}

function isSafeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  return !scheme || scheme === "http" || scheme === "https" || scheme === "blob";
}

function button(label: string, className: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  return el;
}

function edgeLabel(edge: ArchEdge): string {
  return edge.label || edge.trigger || edge.flow || `${edge.from} -> ${edge.to}`;
}

function scenarioById(model: ArchMapModel, id: string | undefined): Scenario | undefined {
  return id ? model.scenarios.find((scenario) => scenario.id === id) : undefined;
}

function edgeResolver(model: ArchMapModel): (ref: string) => ArchEdge | undefined {
  const byId = new Map(model.edges.map((edge) => [edge.id, edge]));
  const byPair = new Map<string, ArchEdge[]>();
  for (const edge of model.edges) {
    const key = edge.pairKey ?? `${edge.from}->${edge.to}`;
    byPair.set(key, [...(byPair.get(key) ?? []), edge]);
  }
  return (ref: string): ArchEdge | undefined => byId.get(ref) ?? (byPair.get(ref)?.length === 1 ? byPair.get(ref)![0] : undefined);
}

function initialScreen(model: ArchMapModel, scenarioId: string | undefined): string | undefined {
  const requested = scenarioById(model, scenarioId);
  if (requested?.start) return requested.start;
  const viewDefault = typeof model.view?.default === "object" ? model.view.default as { prototype?: { scenario?: string } } : undefined;
  const metadataScenario = scenarioById(model, viewDefault?.prototype?.scenario);
  if (metadataScenario?.start) return metadataScenario.start;
  const firstScenario = model.scenarios[0];
  if (firstScenario?.start) return firstScenario.start;
  const incoming = new Set(model.edges.map((edge) => edge.to));
  const rootScreen = model.nodes.find((node) => isScreenNode(node) && !incoming.has(node.id));
  if (rootScreen) return rootScreen.id;
  return model.nodes.find(isScreenNode)?.id ?? model.nodes[0]?.id;
}

function relatedDiagnostics(model: ArchMapModel, screenId: string, outgoing: ArchEdge[], scenarioId: string | null): Diagnostic[] {
  const outgoingIds = new Set(outgoing.map((edge) => edge.id));
  return model.diagnostics.filter((entry) => {
    if (entry.target?.type === "node" && entry.target.id === screenId) return true;
    if (entry.target?.type === "edge" && outgoingIds.has(entry.target.id)) return true;
    if (entry.target?.type === "view" && scenarioId && entry.target.id === scenarioId) return true;
    return false;
  });
}

function dataForEdges(model: ArchMapModel, edges: ArchEdge[]): DataObject[] {
  const ids = new Set(edges.flatMap((edge) => edge.dataIds ?? []));
  return model.data.filter((entry) => ids.has(entry.id));
}

function emit(target: Element, name: string, detail: Record<string, unknown>): void {
  target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

export function prototypeView({ model, options }: ViewContext): MountableView {
  return {
    mount(target: Element): ViewHandle {
      const root = document.createElement("div");
      root.className = "archmap-prototype";
      root.style.cssText =
        "display:grid;grid-template-columns:minmax(280px,1fr) 280px;gap:16px;width:100%;height:100%;" +
        "box-sizing:border-box;padding:16px;background:#f8fafc;color:#172033;font:13px system-ui,sans-serif;overflow:auto;";
      const style = document.createElement("style");
      style.textContent = [
        ".archmap-prototype *{box-sizing:border-box}",
        ".archmap-prototype-screen{min-height:360px;display:flex;align-items:center;justify-content:center;border:1px solid #cbd5e1;border-radius:8px;background:#fff;position:relative;overflow:hidden}",
        ".archmap-prototype-screen img{max-width:100%;max-height:100%;object-fit:contain;display:block}",
        ".archmap-prototype-card{min-width:240px;max-width:520px;border:2px solid #315b92;border-radius:8px;padding:28px;background:#eef6ff;text-align:center}",
        ".archmap-prototype-title{font-size:22px;font-weight:800;margin-bottom:8px}",
        ".archmap-prototype-meta{color:#55657d}",
        ".archmap-prototype-hotspot{position:absolute;border:2px solid #2563eb;background:rgba(37,99,235,.14);border-radius:6px;cursor:pointer}",
        ".archmap-prototype-panel{display:flex;flex-direction:column;gap:12px}",
        ".archmap-prototype-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
        ".archmap-prototype button,.archmap-prototype select{border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#172033;padding:7px 9px;font:600 12px system-ui,sans-serif}",
        ".archmap-prototype button{cursor:pointer}",
        ".archmap-prototype-transition{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left}",
        ".archmap-prototype-badge{display:inline-flex;border-radius:999px;background:#e2e8f0;color:#334155;padding:2px 7px;font-size:11px;font-weight:700}",
        ".archmap-prototype-warning{color:#92400e;font-weight:700}",
        ".archmap-prototype-error{color:#991b1b;font-weight:800}",
        ".archmap-prototype-card-panel{border:1px solid #d7dee9;border-radius:8px;background:#fff;padding:10px}",
        ".archmap-prototype-card-panel h3{margin:0 0 8px;font-size:13px}",
        ".archmap-prototype-card-panel ul{margin:0;padding-left:18px}",
      ].join("");
      root.appendChild(style);

      const screenPane = document.createElement("div");
      screenPane.className = "archmap-prototype-screen";
      const panel = document.createElement("aside");
      panel.className = "archmap-prototype-panel";
      root.append(screenPane, panel);
      target.innerHTML = "";
      target.appendChild(root);

      const resolveEdge = edgeResolver(model);
      let scenario: Scenario | undefined = scenarioById(model, options.scenario) ?? model.scenarios[0];
      let current = initialScreen(model, scenario?.id);
      let scenarioIndex = 0;
      let showHotspots = options.showHotspots === true;
      const history: string[] = [];

      const currentNode = (): ArchNode | undefined => model.nodes.find((node) => node.id === current);
      const outgoing = (): ArchEdge[] => model.edges.filter((edge) => edge.from === current);
      const transitionByScenarioStep = (): ArchEdge | undefined => {
        if (!scenario) return undefined;
        const ref = scenario.steps[scenarioIndex];
        return ref ? resolveEdge(ref) : undefined;
      };

      const goTo = (screenId: string, via?: ArchEdge): void => {
        if (current && current !== screenId) history.push(current);
        const from = current;
        current = screenId;
        if (scenario && via) {
          const step = scenario.steps.findIndex((ref) => resolveEdge(ref)?.id === via.id);
          if (step >= 0) scenarioIndex = Math.min(step + 1, scenario.steps.length);
        }
        renderUi();
        emit(target, "archmap:prototype-screen-change", { from, to: screenId, edgeId: via?.id, scenario: scenario?.id ?? null });
        if (via) emit(target, "archmap:prototype-transition", { from, to: screenId, edgeId: via.id, scenario: scenario?.id ?? null });
      };

      const selectScenario = (id: string): void => {
        scenario = scenarioById(model, id);
        scenarioIndex = 0;
        history.length = 0;
        current = initialScreen(model, scenario?.id);
        renderUi();
        emit(target, "archmap:prototype-scenario-change", { scenario: scenario?.id ?? null, start: current ?? null });
      };

      const renderScreen = (node: ArchNode | undefined, edges: ArchEdge[]): void => {
        screenPane.textContent = "";
        if (!node) {
          const card = document.createElement("div");
          card.className = "archmap-prototype-card";
          card.textContent = "No screen selected.";
          screenPane.appendChild(card);
          return;
        }
        if (node.image && isSafeImageUrl(node.image)) {
          const img = document.createElement("img");
          img.src = node.image;
          img.alt = node.label;
          screenPane.appendChild(img);
        } else {
          const card = document.createElement("div");
          card.className = "archmap-prototype-card";
          const title = document.createElement("div");
          title.className = "archmap-prototype-title";
          title.textContent = node.label;
          const meta = document.createElement("div");
          meta.className = "archmap-prototype-meta";
          meta.textContent = [node.kind, node.zone].filter(Boolean).join(" · ") || node.id;
          card.append(title, meta);
          screenPane.appendChild(card);
        }
        if (!showHotspots || !node.frame?.width || !node.frame.height) return;
        const scaleX = 100 / node.frame.width;
        const scaleY = 100 / node.frame.height;
        for (const edge of edges) {
          if (!edge.hotspot) continue;
          const hotspot = document.createElement("button");
          hotspot.type = "button";
          hotspot.className = "archmap-prototype-hotspot";
          hotspot.title = edgeLabel(edge);
          hotspot.style.left = `${edge.hotspot.x * scaleX}%`;
          hotspot.style.top = `${edge.hotspot.y * scaleY}%`;
          hotspot.style.width = `${edge.hotspot.width * scaleX}%`;
          hotspot.style.height = `${edge.hotspot.height * scaleY}%`;
          hotspot.addEventListener("click", () => {
            emit(target, "archmap:prototype-hotspot-click", { from: edge.from, to: edge.to, edgeId: edge.id, scenario: scenario?.id ?? null });
            goTo(edge.to, edge);
          });
          screenPane.appendChild(hotspot);
        }
      };

      const renderUi = (): void => {
        const node = currentNode();
        const edges = outgoing();
        renderScreen(node, edges);
        panel.textContent = "";

        const nav = document.createElement("div");
        nav.className = "archmap-prototype-row";
        const backButton = button("Back", "archmap-prototype-back");
        backButton.disabled = history.length === 0;
        backButton.addEventListener("click", () => {
          const previous = history.pop();
          if (!previous) return;
          current = previous;
          renderUi();
          emit(target, "archmap:prototype-screen-change", { from: node?.id, to: previous, edgeId: null, scenario: scenario?.id ?? null });
        });
        const nextButton = button("Next", "archmap-prototype-next");
        nextButton.addEventListener("click", () => {
          const edge = transitionByScenarioStep() ?? edges[0];
          if (edge) goTo(edge.to, edge);
        });
        const resetButton = button("Reset", "archmap-prototype-reset");
        resetButton.addEventListener("click", () => {
          scenarioIndex = 0;
          history.length = 0;
          current = initialScreen(model, scenario?.id);
          renderUi();
        });
        nav.append(backButton, nextButton, resetButton);
        panel.appendChild(nav);

        if (model.scenarios.length > 0) {
          const select = document.createElement("select");
          select.className = "archmap-prototype-scenario";
          for (const item of model.scenarios) {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.label ?? item.id;
            option.selected = item.id === scenario?.id;
            select.appendChild(option);
          }
          select.addEventListener("change", () => selectScenario(select.value));
          panel.appendChild(select);
        }

        const hotspotToggle = button(showHotspots ? "Hide hotspots" : "Show hotspots", "archmap-prototype-hotspots");
        hotspotToggle.addEventListener("click", () => {
          showHotspots = !showHotspots;
          renderUi();
        });
        panel.appendChild(hotspotToggle);

        const transitions = document.createElement("div");
        transitions.className = "archmap-prototype-card-panel";
        const transitionsTitle = document.createElement("h3");
        transitionsTitle.textContent = "Outgoing transitions";
        transitions.appendChild(transitionsTitle);
        for (const edge of edges) {
          const item = button(edgeLabel(edge), "archmap-prototype-transition");
          const targetLabel = model.nodes.find((entry) => entry.id === edge.to)?.label ?? edge.to;
          const badge = document.createElement("span");
          badge.className = "archmap-prototype-badge";
          badge.textContent = edge.trigger ?? edge.flow ?? "transition";
          item.textContent = "";
          item.append(document.createTextNode(targetLabel), badge);
          item.addEventListener("click", () => goTo(edge.to, edge));
          transitions.appendChild(item);
        }
        panel.appendChild(transitions);

        const overlayPanel = document.createElement("div");
        overlayPanel.className = "archmap-prototype-card-panel";
        const overlayTitle = document.createElement("h3");
        overlayTitle.textContent = `Overlays: ${(options.overlays ?? []).join(", ") || "none"}`;
        overlayPanel.appendChild(overlayTitle);
        const overlayList = document.createElement("ul");
        if (options.overlays?.includes("dataflow")) {
          for (const data of dataForEdges(model, edges)) {
            const li = document.createElement("li");
            li.textContent = `dataflow: ${data.label ?? data.id}${data.classification ? ` (${data.classification})` : ""}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("auth")) {
          for (const edge of edges.filter((entry) => entry.auth || entry.flow === "auth_check")) {
            const li = document.createElement("li");
            li.textContent = `auth: ${edge.auth?.token ?? edge.flow ?? edge.id}${edge.auth?.issuer ? ` / issuer ${edge.auth.issuer}` : ""}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("boundary")) {
          for (const edge of edges.filter((entry) => entry.boundaryCrossing)) {
            const li = document.createElement("li");
            li.textContent = `boundary: ${edge.label ?? edge.id}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("permission")) {
          for (const permission of model.permissions.filter((entry) => entry.resource === current || (typeof entry.resource !== "string" && entry.resource.id === current))) {
            const li = document.createElement("li");
            li.textContent = `permission: ${permission.principal} ${permission.action}`;
            overlayList.appendChild(li);
          }
        }
        if (options.overlays?.includes("validation")) {
          for (const entry of relatedDiagnostics(model, current ?? "", edges, scenario?.id ?? null)) {
            const li = document.createElement("li");
            li.className = entry.level === "error" ? "archmap-prototype-error" : entry.level === "warning" ? "archmap-prototype-warning" : "";
            li.textContent = `${entry.code}: ${entry.message}`;
            overlayList.appendChild(li);
          }
        }
        overlayPanel.appendChild(overlayList);
        panel.appendChild(overlayPanel);
      };

      renderUi();

      return {
        dispose() {
          root.remove();
        },
        setScenario: selectScenario,
        getScenario: () => scenario?.id ?? null,
        goToScreen: (id: string) => {
          if (model.nodes.some((node) => node.id === id)) goTo(id);
        },
        getCurrentScreen: () => current ?? null,
        next: () => {
          const edge = transitionByScenarioStep() ?? outgoing()[0];
          if (edge) goTo(edge.to, edge);
        },
        back: () => {
          const previous = history.pop();
          if (!previous) return;
          current = previous;
          renderUi();
        },
        toggleHotspots: (enabled?: boolean) => {
          showHotspots = enabled ?? !showHotspots;
          renderUi();
        },
      };
    },
  };
}
