export type DiagramTagAction = "toggleSize" | "expand" | "minimize" | "fit" | "reset" | "download" | "fullscreen" | "lock";

export interface DiagramTagOption {
  value: string;
  label: string;
}

export interface DiagramTagsState {
  baseView: string;
  renderMode: string;
  overlays: string[];
  abstractionLocked?: boolean;
  fullscreen?: boolean;
  minimized?: boolean;
  expanded?: boolean;
  /** Active timeline phase (v0.2 4D); only meaningful with a timeline group. */
  phase?: string;
}

export interface DiagramTagsChangeEvent {
  kind: "baseView" | "renderMode" | "overlay" | "phase";
  value: string;
  checked: boolean;
}

/** Timeline slider group (v0.2 4D). Rendered only when `phases` is non-empty. */
export interface DiagramTagsTimelineOptions {
  /** Ordered timeline phases. */
  phases: DiagramTagOption[];
  /** Group label. Default: "Phase". */
  label?: string;
}

export interface DiagramTagsOptions {
  target: Element;
  state?: Partial<DiagramTagsState>;
  views?: DiagramTagOption[];
  renderModes?: DiagramTagOption[];
  overlays?: DiagramTagOption[];
  actions?: DiagramTagAction[];
  /** Optional timeline phase slider (prev / range / next / label). */
  timeline?: DiagramTagsTimelineOptions;
  labels?: Partial<{
    views: string;
    renderModes: string;
    overlays: string;
  }>;
  names?: Partial<{
    baseView: string;
    renderMode: string;
    overlay: string;
  }>;
  onChange?: (state: DiagramTagsState, event: DiagramTagsChangeEvent) => void;
  onAction?: (action: DiagramTagAction, state: DiagramTagsState) => void;
}

export interface DiagramTagsHandle {
  element: HTMLDivElement;
  getState(): DiagramTagsState;
  setState(state: Partial<DiagramTagsState>): void;
  destroy(): void;
}

export const DEFAULT_DIAGRAM_TAG_VIEWS: DiagramTagOption[] = [
  { value: "overview", label: "Overview" },
  { value: "layer", label: "Layer" },
  { value: "prototype", label: "Prototype" },
];

export const DEFAULT_DIAGRAM_TAG_RENDER_MODES: DiagramTagOption[] = [
  { value: "2d", label: "2D" },
  { value: "3d", label: "3D" },
];

export const DEFAULT_DIAGRAM_TAG_OVERLAYS: DiagramTagOption[] = [
  { value: "subgraph", label: "subgraph" },
  { value: "zone", label: "zone" },
  { value: "auth", label: "auth" },
  { value: "dataflow", label: "dataflow" },
  { value: "boundary", label: "boundary" },
  { value: "permission", label: "permission" },
  { value: "validation", label: "validation" },
  { value: "timeline", label: "timeline" },
];

export const DEFAULT_DIAGRAM_TAG_ACTIONS: DiagramTagAction[] = ["toggleSize", "fit", "lock", "download", "fullscreen"];

const STYLE_ID = "archmap-diagram-tags-style";

const actionLabels: Record<DiagramTagAction, string> = {
  toggleSize: "Minimize tags",
  expand: "Expand tags",
  minimize: "Minimize tags",
  fit: "Fit diagram",
  reset: "Reset zoom",
  download: "Export PNG",
  fullscreen: "Fullscreen",
  lock: "Lock component expansion",
};

const actionPaths: Record<DiagramTagAction | "unlock" | "toggleSizeOpen" | "toggleSizeClosed", string> = {
  toggleSize: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8"/><path d="m9 15 3-3 3 3"/>',
  toggleSizeOpen: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8"/><path d="m9 15 3-3 3 3"/>',
  toggleSizeClosed: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8"/><path d="m9 12 3 3 3-3"/>',
  expand: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/>',
  minimize: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 15h8"/>',
  fit: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/><circle cx="12" cy="12" r="3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  fullscreen: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
};

export function injectDiagramTagsStyle(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.archmap-diagram-tags{position:sticky;top:12px;left:12px;z-index:5;width:min(740px,calc(100% - 24px));margin-bottom:-42px;display:flex;align-items:flex-start;gap:8px;pointer-events:none}
.archmap-diagram-tags-panel{pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px;border:1px solid rgba(148,163,184,.45);border-radius:8px;background:rgba(255,255,255,.92);box-shadow:0 10px 28px rgba(28,39,51,.12);backdrop-filter:blur(8px)}
.archmap-diagram-tags-panel.is-minimized .archmap-diagram-tags-group{display:none}
.archmap-diagram-tags-panel.is-expanded{width:min(960px,calc(100vw - 420px))}
.archmap-diagram-tags-group{display:inline-flex;align-items:center;gap:5px;border:0;padding:0;margin:0 4px 0 0;min-width:0}
.archmap-diagram-tags-label{font-size:11px;font-weight:700;color:#64748b;margin-right:2px;white-space:nowrap}
.archmap-diagram-tag{display:inline-flex;align-items:center;gap:5px;min-height:24px;padding:3px 8px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#334155;font:600 12px system-ui,sans-serif;white-space:nowrap;cursor:pointer}
.archmap-diagram-tag input{margin:0;accent-color:#34507a}
.archmap-diagram-tag.is-active{background:#e6edf7;border-color:#7892bd;color:#213a63}
.archmap-diagram-tag-action{min-width:28px;min-height:26px;padding:3px 8px;border-radius:999px;background:#eef2f7;color:#334155;border:1px solid #cbd5e1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.archmap-diagram-tag-action.is-active{background:#e6edf7;border-color:#7892bd;color:#213a63}
.archmap-diagram-tag-action svg{width:15px;height:15px;display:block;stroke:currentColor}
.archmap-diagram-tags-timeline{gap:6px}
.archmap-diagram-tag-phase-step{min-width:24px;min-height:24px;padding:2px 6px;border-radius:999px;background:#eef2f7;color:#334155;border:1px solid #cbd5e1;cursor:pointer;font:700 12px system-ui,sans-serif}
.archmap-diagram-tag-phase-step:disabled{opacity:.4;cursor:default}
.archmap-diagram-tag-phase-range{width:110px;accent-color:#34507a;margin:0}
.archmap-diagram-tag-phase-label{font:700 12px system-ui,sans-serif;color:#213a63;white-space:nowrap}
`;
  doc.head.appendChild(style);
}

export function createDiagramTags(options: DiagramTagsOptions): DiagramTagsHandle {
  const doc = options.target.ownerDocument ?? document;
  injectDiagramTagsStyle(doc);
  const views = options.views ?? DEFAULT_DIAGRAM_TAG_VIEWS;
  const renderModes = options.renderModes ?? DEFAULT_DIAGRAM_TAG_RENDER_MODES;
  const overlays = options.overlays ?? DEFAULT_DIAGRAM_TAG_OVERLAYS;
  const actions = options.actions ?? DEFAULT_DIAGRAM_TAG_ACTIONS;
  const labels = { views: "Views", renderModes: "Render modes", overlays: "Add info", ...options.labels };
  const names = { baseView: "base-view", renderMode: "render-mode", overlay: "overlay", ...options.names };
  const timeline = options.timeline && options.timeline.phases.length > 0 ? options.timeline : undefined;
  let state: DiagramTagsState = {
    baseView: options.state?.baseView ?? views[0]?.value ?? "overview",
    renderMode: options.state?.renderMode ?? renderModes[0]?.value ?? "2d",
    overlays: [...(options.state?.overlays ?? [])],
    abstractionLocked: options.state?.abstractionLocked ?? false,
    fullscreen: options.state?.fullscreen ?? false,
    minimized: options.state?.minimized ?? false,
    expanded: options.state?.expanded ?? false,
    phase: options.state?.phase ?? timeline?.phases[0]?.value,
  };

  const root = doc.createElement("div");
  root.className = "archmap-diagram-tags";
  const panel = doc.createElement("div");
  panel.className = "archmap-diagram-tags-panel";
  root.appendChild(panel);

  const renderIcon = (button: HTMLButtonElement, action: DiagramTagAction): void => {
    const icon = action === "lock" && !state.abstractionLocked
      ? "unlock"
      : action === "toggleSize"
        ? state.minimized ? "toggleSizeClosed" : "toggleSizeOpen"
        : action;
    button.replaceChildren();
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke-width", "2");
    svg.innerHTML = actionPaths[icon];
    button.appendChild(svg);
    const title = action === "lock"
      ? state.abstractionLocked ? "Unlock component expansion" : "Lock component expansion"
      : action === "toggleSize"
        ? state.minimized ? "Expand tags" : "Minimize tags"
        : actionLabels[action];
    button.title = title;
    button.ariaLabel = title;
    button.classList.toggle("is-active", action === "lock" && Boolean(state.abstractionLocked));
  };

  const sync = (): void => {
    panel.classList.toggle("is-minimized", Boolean(state.minimized));
    panel.classList.toggle("is-expanded", Boolean(state.expanded));
    panel.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((input) => {
      const checked = input.name === names.baseView ? input.value === state.baseView : input.value === state.renderMode;
      input.checked = checked;
      input.closest(".archmap-diagram-tag")?.classList.toggle("is-active", checked);
    });
    panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      const checked = state.overlays.includes(input.value);
      input.checked = checked;
      input.closest(".archmap-diagram-tag")?.classList.toggle("is-active", checked);
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-archmap-action]").forEach((button) => {
      renderIcon(button, button.dataset.archmapAction as DiagramTagAction);
    });
    if (timeline) {
      const index = Math.max(0, timeline.phases.findIndex((phase) => phase.value === state.phase));
      const phase = timeline.phases[index];
      const range = panel.querySelector<HTMLInputElement>(".archmap-diagram-tag-phase-range");
      if (range) range.value = String(index);
      const label = panel.querySelector<HTMLElement>(".archmap-diagram-tag-phase-label");
      if (label) label.textContent = phase?.label ?? phase?.value ?? "";
      const prev = panel.querySelector<HTMLButtonElement>(".archmap-diagram-tag-phase-prev");
      if (prev) prev.disabled = index <= 0;
      const next = panel.querySelector<HTMLButtonElement>(".archmap-diagram-tag-phase-next");
      if (next) next.disabled = index >= timeline.phases.length - 1;
    }
  };

  const emitChange = (event: DiagramTagsChangeEvent): void => options.onChange?.({ ...state, overlays: [...state.overlays] }, event);
  const emitAction = (action: DiagramTagAction): void => options.onAction?.(action, { ...state, overlays: [...state.overlays] });

  const addAction = (action: DiagramTagAction): void => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "archmap-diagram-tag-action";
    button.dataset.archmapAction = action;
    button.addEventListener("click", () => {
      if (action === "expand") state = { ...state, expanded: true, minimized: false };
      if (action === "minimize") state = { ...state, expanded: false, minimized: true };
      if (action === "toggleSize") state = { ...state, expanded: false, minimized: !state.minimized };
      if (action === "lock") state = { ...state, abstractionLocked: !state.abstractionLocked };
      sync();
      emitAction(action);
    });
    panel.appendChild(button);
  };

  const addGroup = (label: string, kind: "baseView" | "renderMode" | "overlay", entries: DiagramTagOption[]): void => {
    const group = doc.createElement("fieldset");
    group.className = "archmap-diagram-tags-group";
    const labelEl = doc.createElement("span");
    labelEl.className = "archmap-diagram-tags-label";
    labelEl.textContent = label;
    group.appendChild(labelEl);
    for (const entry of entries) {
      const wrap = doc.createElement("label");
      wrap.className = "archmap-diagram-tag";
      const input = doc.createElement("input");
      input.type = kind === "overlay" ? "checkbox" : "radio";
      input.name = kind === "baseView" ? names.baseView : kind === "renderMode" ? names.renderMode : names.overlay;
      input.value = entry.value;
      input.addEventListener("change", () => {
        if (kind === "baseView" && input.checked) state = { ...state, baseView: entry.value };
        if (kind === "renderMode" && input.checked) state = { ...state, renderMode: entry.value };
        if (kind === "overlay") {
          state = input.checked
            ? { ...state, overlays: [...new Set([...state.overlays, entry.value])] }
            : { ...state, overlays: state.overlays.filter((overlay) => overlay !== entry.value) };
        }
        sync();
        emitChange({ kind, value: entry.value, checked: input.checked });
      });
      wrap.append(input, doc.createTextNode(entry.label));
      group.appendChild(wrap);
    }
    panel.appendChild(group);
  };

  const addTimelineGroup = (): void => {
    if (!timeline) return;
    const group = doc.createElement("fieldset");
    group.className = "archmap-diagram-tags-group archmap-diagram-tags-timeline";
    const labelEl = doc.createElement("span");
    labelEl.className = "archmap-diagram-tags-label";
    labelEl.textContent = timeline.label ?? "Phase";
    const stepTo = (index: number): void => {
      const phase = timeline.phases[Math.max(0, Math.min(timeline.phases.length - 1, index))];
      if (!phase || phase.value === state.phase) return;
      state = { ...state, phase: phase.value };
      sync();
      emitChange({ kind: "phase", value: phase.value, checked: true });
    };
    const indexNow = (): number => Math.max(0, timeline.phases.findIndex((phase) => phase.value === state.phase));
    const prev = doc.createElement("button");
    prev.type = "button";
    prev.className = "archmap-diagram-tag-phase-step archmap-diagram-tag-phase-prev";
    prev.textContent = "‹";
    prev.title = "Previous phase";
    prev.addEventListener("click", () => stepTo(indexNow() - 1));
    const range = doc.createElement("input");
    range.type = "range";
    range.className = "archmap-diagram-tag-phase-range";
    range.min = "0";
    range.max = String(timeline.phases.length - 1);
    range.step = "1";
    range.setAttribute("aria-label", timeline.label ?? "Timeline phase");
    range.addEventListener("input", () => stepTo(Number(range.value)));
    const next = doc.createElement("button");
    next.type = "button";
    next.className = "archmap-diagram-tag-phase-step archmap-diagram-tag-phase-next";
    next.textContent = "›";
    next.title = "Next phase";
    next.addEventListener("click", () => stepTo(indexNow() + 1));
    const current = doc.createElement("span");
    current.className = "archmap-diagram-tag-phase-label";
    group.append(labelEl, prev, range, next, current);
    panel.appendChild(group);
  };

  for (const action of actions) addAction(action);
  addGroup(labels.views, "baseView", views);
  addGroup(labels.renderModes, "renderMode", renderModes);
  addGroup(labels.overlays, "overlay", overlays);
  addTimelineGroup();
  sync();
  options.target.replaceChildren(root);

  return {
    element: root,
    getState: () => ({ ...state, overlays: [...state.overlays] }),
    setState(next) {
      state = { ...state, ...next, overlays: next.overlays ? [...next.overlays] : state.overlays };
      sync();
    },
    destroy() {
      root.remove();
    },
  };
}
