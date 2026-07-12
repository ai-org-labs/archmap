/**
 * SAMPLE 3D view — NOT part of the core bundle. Opt in:
 *
 *   import { installThreeView } from "@archmap/core/views3d/three-view";
 *   installThreeView();
 *   ArchMap.render(model, { view: "3d", target: el });  // returns { handle }
 *
 * Requires `three` as a peer dependency. Consumes the same LayoutResult as the
 * 2D views; `z` (layer depth) becomes height. Zones render as translucent
 * labeled volumes (non-overlapping, thanks to layout swimlanes); nodes carry
 * the same provider/kind icons as 2D; a corner view cube mirrors rotation and
 * snaps to top/front/side.
 * The returned handle owns the canvas + animation loop — call handle.dispose().
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { registerView, resolveNodeIcons } from "@archmap/core";
import type { MountableView, ViewContext, ViewHandle, RenderableIcon } from "@archmap/core";
import { buildScene3D } from "./scene.js";
import type { Scene3D } from "./scene.js";
import { buildOverlayProjection } from "../views/overlays.js";
import { computePhasePresence, resolvePhaseId } from "../time-projection.js";
import type { Box } from "../views/base.js";
import { WHEEL_PAN_SENSITIVITY, wheelUnit } from "../views/wheel.js";

/** Per-layer color ramp (client → external), tuned to the soft station-map palette used by isometric SVG. */
const LAYER_COLORS = [
  0xdff1fb, 0xf8d4b8, 0xf8c982, 0xffefb0, 0xd8edf3,
  0xe8ddfa, 0xdbe6f6, 0xe6e9ee, 0xf3e4c8,
];

/** Per-zone color ramp, so AWS / GCP / client volumes read distinctly. */
const ZONE_COLORS = [
  0x7da7d9, 0xf4a261, 0x8fc7a3, 0xb79ce8, 0x78c2bc, 0xdd88a6,
];

const SCENE_SCALE = 0.02;
const OVERLAY_EDGE_COLOR = 0x7a4f9a;
const EMPHASIS_EDGE_COLOR = 0xb3261e;
const BOUNDARY_COLOR = 0xc0a044;

function layerColor(layer: number): number {
  return LAYER_COLORS[layer % LAYER_COLORS.length];
}

interface LabelOpts {
  fg?: string;
  bg?: string;
  scaleY?: number;
  bold?: boolean;
  icon?: "auth" | "data" | "boundary" | "permission" | "validation";
}

function makeTextSprite(text: string, opts: LabelOpts = {}): THREE.Sprite {
  const fg = opts.fg ?? "#1c2733";
  const bg = opts.bg ?? "rgba(255,255,255,0.92)";
  const scaleY = opts.scaleY ?? 0.5;
  const pad = 8;
  const iconWidth = opts.icon ? 24 : 0;
  const font = `${opts.bold ? "600 " : ""}28px system-ui, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const tw = Math.ceil(measure.measureText(text).width);
  const canvas = document.createElement("canvas");
  canvas.width = tw + pad * 2 + iconWidth;
  canvas.height = 40;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (opts.icon) {
    const color = opts.icon === "auth" ? "#b3261e"
      : opts.icon === "data" ? "#16846d"
        : opts.icon === "boundary" ? "#c0a044"
          : opts.icon === "permission" ? "#7a4f9a"
            : "#c2410c";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pad + 8, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(pad + 6, 20, 15, 9);
  }
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad + iconWidth, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set((canvas.width / canvas.height) * scaleY, scaleY, 1);
  return sprite;
}

/** Rasterize an inline-SVG icon into a billboard sprite. */
function makeIconSprite(icon: RenderableIcon): { sprite: THREE.Sprite; texture: THREE.Texture } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}">${icon.body}</svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const texture = new THREE.Texture();
  const img = new Image();
  img.onload = () => {
    texture.image = img;
    texture.needsUpdate = true;
  };
  img.src = url;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(0.55, 0.55, 1);
  return { sprite, texture };
}

function disposeSprite(sprite: THREE.Sprite, disposables: { dispose(): void }[]): void {
  if (sprite.material.map) disposables.push(sprite.material.map);
  disposables.push(sprite.material);
}

function edgeBadgeStyle(kind: string): Pick<LabelOpts, "fg" | "bg" | "icon"> {
  if (kind === "auth-summary") return { fg: "#7f1d1d", bg: "rgba(255,247,237,0.96)", icon: "auth" };
  if (kind === "data-summary") return { fg: "#0f5f4e", bg: "rgba(238,249,245,0.96)", icon: "data" };
  if (kind === "boundary-summary") return { fg: "#7d704b", bg: "rgba(255,250,240,0.96)", icon: "boundary" };
  if (kind === "permission-summary") return { fg: "#7a4f9a", bg: "rgba(246,240,255,0.96)", icon: "permission" };
  return { fg: "#c2410c", bg: "rgba(255,247,237,0.96)", icon: "validation" };
}

function buildSceneGraph(ctx: ViewContext, scene3d: Scene3D, icons: Map<string, RenderableIcon>): {
  root: THREE.Group;
  disposables: { dispose(): void }[];
} {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const phaseId = ctx.options.phase ? resolvePhaseId(ctx.model, ctx.options.phase) : undefined;
  const presence = phaseId ? computePhasePresence(ctx.model, phaseId) : undefined;
  const projection = buildOverlayProjection(ctx.model, ctx.layout, ctx.options.overlays ?? [], {
    ...(phaseId ? { phase: phaseId } : {}),
    baseView: ctx.options.baseView,
    view: ctx.options.renderMode === "3d" || ctx.options.renderMode === "isometric" ? "3d" : ctx.options.baseView,
  });
  const emphasizeNodes = projection.emphasizeNodes ?? new Set<string>();
  const emphasizeEdges = projection.emphasizeEdges ?? new Set<string>();
  const badges = projection.nodeBadges ?? new Map<string, string>();
  const edgeBadges = projection.edgeBadges ?? new Map<string, Array<{ kind: string; label: string }>>();
  const nodeById = new Map(scene3d.nodes.map((n) => [n.id, n]));

  // Nodes as boxes + labels.
  for (const n of scene3d.nodes) {
    // Minimal 4D parity: elements absent at the active timeline phase render
    // as ghosts (per-state coloring in 3D is a documented follow-up).
    const nodeAbsent = presence?.absentNodes.has(n.id) === true;
    const geo = track(new THREE.BoxGeometry(n.w, n.h, n.d));
    const mat = track(new THREE.MeshStandardMaterial({
      color: layerColor(n.layer),
      emissive: emphasizeNodes.has(n.id) ? 0x5c2d14 : 0x000000,
      emissiveIntensity: emphasizeNodes.has(n.id) ? 0.18 : 0,
      roughness: 0.82,
      metalness: 0,
      flatShading: true,
      transparent: nodeAbsent,
      opacity: nodeAbsent ? 0.15 : 1,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, n.y, n.z);
    root.add(mesh);

    // Provider/kind icon (same registry as 2D), as a billboard above the box.
    const icon = icons.get(n.id);
    const labelY = icon ? n.y + n.h / 2 + 0.95 : n.y + n.h / 2 + 0.45;
    if (icon && !nodeAbsent) {
      const { sprite, texture } = makeIconSprite(icon);
      sprite.position.set(n.x - n.w / 2 + 0.38, n.y + n.h / 2 + 0.42, n.z - n.d / 2 + 0.38);
      disposables.push(texture, sprite.material);
      root.add(sprite);
    }

    const label = makeTextSprite(n.label);
    label.position.set(n.x, labelY, n.z);
    if (nodeAbsent) label.material.opacity = 0.25;
    disposeSprite(label, disposables);
    root.add(label);

    const badge = badges.get(n.id);
    if (badge) {
      const authBadge = badge.startsWith("auth:");
      const badgeSprite = makeTextSprite(authBadge ? badge.slice("auth:".length) : badge, {
        fg: authBadge ? "#7f1d1d" : "#7a4f9a",
        bg: authBadge ? "rgba(255,247,237,0.96)" : "rgba(255,255,255,0.9)",
        scaleY: authBadge ? 0.5 : 0.42,
        bold: true,
        icon: authBadge ? "auth" : undefined,
      });
      badgeSprite.position.set(n.x + n.w / 2 + 0.35, n.y + n.h / 2 + 0.38, n.z);
      disposeSprite(badgeSprite, disposables);
      root.add(badgeSprite);
    }
  }

  // Edges as lines.
  for (const e of scene3d.edges) {
    const isEmphasized = emphasizeEdges.has(e.id);
    const edgeAbsent = presence?.absentEdges.has(e.id) === true;
    const edgeMat = track(new THREE.LineBasicMaterial({
      color: isEmphasized ? EMPHASIS_EDGE_COLOR : 0x52617a,
      transparent: true,
      opacity: edgeAbsent ? 0.08 : isEmphasized ? 0.95 : 0.58,
    }));
    const geo = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(e.a.x, e.a.y, e.a.z),
        new THREE.Vector3(e.b.x, e.b.y, e.b.z),
      ]),
    );
    root.add(new THREE.Line(geo, edgeMat));
    if (isEmphasized && e.label) {
      const label = makeTextSprite(e.label, { fg: "#3a4a63", bg: "rgba(255,255,255,0.84)", scaleY: 0.36 });
      label.position.set((e.a.x + e.b.x) / 2, Math.max(e.a.y, e.b.y) + 0.42, (e.a.z + e.b.z) / 2);
      disposeSprite(label, disposables);
      root.add(label);
    }
    const edgeBadge = edgeBadges.get(e.id)?.[0];
    if (edgeBadge) {
      const style = edgeBadgeStyle(edgeBadge.kind);
      const label = makeTextSprite(edgeBadge.label, {
        ...style,
        scaleY: 0.42,
        bold: true,
      });
      label.position.set((e.a.x + e.b.x) / 2, Math.max(e.a.y, e.b.y) + 0.82, (e.a.z + e.b.z) / 2);
      disposeSprite(label, disposables);
      root.add(label);
    }
  }

  // Synthesized overlay edges, currently used by permission relationships.
  for (const e of projection.overlayEdges ?? []) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) continue;
    const mat = track(new THREE.LineDashedMaterial({ color: OVERLAY_EDGE_COLOR, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9 }));
    const geo = track(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, a.y + a.h / 2 + 0.18, a.z),
      new THREE.Vector3(b.x, b.y + b.h / 2 + 0.18, b.z),
    ]));
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    root.add(line);
    if (e.label) {
      const label = makeTextSprite(e.label, { fg: "#7a4f9a", bg: "rgba(255,255,255,0.88)", scaleY: 0.34, bold: true });
      label.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.75, (a.z + b.z) / 2);
      disposeSprite(label, disposables);
      root.add(label);
    }
  }

  // Zones are Add info in 3D too: structure-only 3D stays clean until the
  // `zone` overlay is enabled.
  if ((ctx.options.overlays ?? []).includes("zone")) {
    const alignStackZoneBases = ctx.options.baseView === "layer";
    const stackZoneBaseY = alignStackZoneBases
      ? Math.min(...scene3d.zones.map((z) => z.y - z.h / 2))
      : 0;
    // Zones as translucent volumes enclosing their members, with wireframe
    // edges and a label floating above. depthWrite:false so they never hide nodes.
    scene3d.zones.forEach((z, i) => {
      const zoneTopY = z.y + z.h / 2;
      const zoneY = alignStackZoneBases ? (stackZoneBaseY + zoneTopY) / 2 : z.y;
      const zoneH = alignStackZoneBases ? Math.max(0.5, zoneTopY - stackZoneBaseY) : z.h;
      const color = ZONE_COLORS[i % ZONE_COLORS.length];
      const geo = track(new THREE.BoxGeometry(z.w, zoneH, z.d));
      const mat = track(
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(z.x, zoneY, z.z);
      mesh.renderOrder = -1;
      root.add(mesh);

      const eg = track(new THREE.EdgesGeometry(geo));
      const line = new THREE.LineSegments(eg, track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })));
      line.position.copy(mesh.position);
      root.add(line);

      const hex = "#" + color.toString(16).padStart(6, "0");
      const label = makeTextSprite(z.label ?? z.id, { fg: hex, bg: "rgba(255,255,255,0.82)", scaleY: 0.62, bold: true });
      label.position.set(z.labelX, alignStackZoneBases ? zoneTopY + 0.55 + i * 0.025 : z.labelY, z.labelZ);
      disposeSprite(label, disposables);
      root.add(label);
    });
  }

  const toWorldBox = (box: Box, yMin: number, yMax: number) => {
    const cx = ctx.layout.width / 2;
    const cy = ctx.layout.height / 2;
    const X = (px: number) => (px - cx) * SCENE_SCALE;
    const Z = (py: number) => (py - cy) * SCENE_SCALE;
    return {
      x: X(box.x + box.w / 2),
      y: (yMin + yMax) / 2,
      z: Z(box.y + box.h / 2),
      w: box.w * SCENE_SCALE,
      h: Math.max(0.5, yMax - yMin),
      d: box.h * SCENE_SCALE,
      labelX: X(box.x + 16),
      labelZ: Z(box.y + 16),
    };
  };
  const yMin = scene3d.bounds.min.y - 0.55;
  const yMax = scene3d.bounds.max.y + 1.3;
  for (const group of projection.boxGroups ?? []) {
    if (!group.boxClass.includes("boundary")) continue;
    for (const box of group.boxes) {
      const b = toWorldBox(box, yMin, yMax);
      const geo = track(new THREE.BoxGeometry(b.w, b.h, b.d));
      const mat = track(new THREE.MeshBasicMaterial({ color: BOUNDARY_COLOR, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y, b.z);
      root.add(mesh);
      const edgeGeo = track(new THREE.EdgesGeometry(geo));
      const edge = new THREE.LineSegments(edgeGeo, track(new THREE.LineBasicMaterial({ color: BOUNDARY_COLOR, transparent: true, opacity: 0.5 })));
      edge.position.copy(mesh.position);
      root.add(edge);
      const label = makeTextSprite(box.label ?? box.id, { fg: "#7d704b", bg: "rgba(255,255,255,0.82)", scaleY: 0.5, bold: true });
      label.position.set(b.labelX, yMax + 0.25, b.labelZ);
      disposeSprite(label, disposables);
      root.add(label);
    }
  }

  return { root, disposables };
}

function mountScene(target: Element, ctx: ViewContext): ViewHandle {
  const el = target as HTMLElement;
  el.innerHTML = "";
  if (!el.style.position) el.style.position = "relative";
  const width = el.clientWidth || 800;
  const height = el.clientHeight || 520;
  const isIsometric = ctx.options.renderMode === "isometric";

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0xffffff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e2ef, 1.15));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(6, 14, 9);
  scene.add(dir);

  const scene3d = buildScene3D(ctx.layout, {
    scale: SCENE_SCALE,
    flattenLayerHeight: ctx.options.baseView === "overview" || ctx.options.baseView === "layer",
  });
  const iconMap = new Map([...resolveNodeIcons(ctx.model)].map(([id, r]) => [id, (Array.isArray(r) ? r[0] : r).icon]));
  const { root, disposables } = buildSceneGraph(ctx, scene3d, iconMap);
  scene.add(root);

  // Frame the camera on the scene center.
  const b = scene3d.bounds;
  const center = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 4);
  const dist = size * 0.85 + 5;
  const aspect = width / height;
  const frustum = size * 1.25 + 4;
  const camera = isIsometric
    ? new THREE.OrthographicCamera(
      -frustum * aspect / 2,
      frustum * aspect / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      2000,
    )
    : new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
  camera.position.set(center.x + dist * 0.72, center.y + dist * (isIsometric ? 0.68 : 0.56), center.z + dist * 0.72);
  camera.lookAt(center);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.enableZoom = false;
  controls.screenSpacePanning = true;
  controls.update();

  let snap: {
    elapsed: number;
    duration: number;
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromUp: THREE.Vector3;
    toUp: THREE.Vector3;
  } | undefined;
  const clock = new THREE.Clock();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const snapCamera = (view: "top" | "front" | "right") => {
    const offset = view === "top"
      ? new THREE.Vector3(0, dist, 0.001)
      : view === "front"
        ? new THREE.Vector3(0, 0, dist)
        : new THREE.Vector3(dist, 0, 0);
    const toUp = view === "top" ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    snap = {
      elapsed: 0,
      duration: 0.42,
      fromPosition: camera.position.clone(),
      toPosition: center.clone().add(offset),
      fromUp: camera.up.clone(),
      toUp,
    };
    controls.target.copy(center);
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    snap = undefined;
    const rect = renderer.domElement.getBoundingClientRect();
    const unit = wheelUnit(event, rect.height || height);
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if (event.ctrlKey) {
      const zoomFactor = Math.exp(-dy * 0.0015);
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * zoomFactor, 0.12, 12);
        camera.updateProjectionMatrix();
      } else {
        const direction = camera.position.clone().sub(controls.target);
        const currentDistance = Math.max(0.001, direction.length());
        const nextDistance = THREE.MathUtils.clamp(
          currentDistance / zoomFactor,
          Math.max(1, size * 0.08),
          Math.max(20, size * 8),
        );
        camera.position.copy(controls.target).add(direction.setLength(nextDistance));
      }
      controls.update();
      return;
    }
    const xDelta = event.shiftKey && Math.abs(dx) < Math.abs(dy) ? dy : dx;
    const panScale = Math.max(0.004, size * 0.0015);
    const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const movement = screenRight
      .multiplyScalar(-xDelta * panScale * WHEEL_PAN_SENSITIVITY)
      .add(screenUp.multiplyScalar(-dy * panScale * WHEEL_PAN_SENSITIVITY));
    camera.position.add(movement);
    controls.target.add(movement);
    controls.update();
  };
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false, capture: true });

  const cube = document.createElement("div");
  cube.className = "archmap-view-cube";
  cube.style.cssText =
    "position:absolute;right:18px;bottom:18px;z-index:4;width:96px;height:96px;perspective:260px;" +
    "pointer-events:auto;";
  const cubeBody = document.createElement("div");
  cubeBody.style.cssText =
    "position:absolute;left:16px;top:16px;width:64px;height:64px;transform-style:preserve-3d;" +
    "transform:rotateX(-26deg) rotateY(36deg);pointer-events:auto;";
  const faceCss =
    "position:absolute;left:0;top:0;width:64px;height:64px;box-sizing:border-box;border:1px solid rgba(85,108,148,0.62);" +
    "background:linear-gradient(135deg,rgba(255,255,255,0.96),rgba(218,231,248,0.88));color:#334155;" +
    "box-shadow:inset 0 0 0 1px rgba(255,255,255,0.58),0 6px 18px rgba(28,39,51,0.14);" +
    "font:700 12px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;";
  const face = (label: string, view: "top" | "front" | "right" | undefined, transform: string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = view ? `${label} view` : "";
    btn.style.cssText = `${faceCss}transform:${transform};cursor:${view ? "pointer" : "default"};pointer-events:${view ? "auto" : "none"};`;
    if (view) btn.dataset.view = view;
    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    btn.addEventListener("pointerup", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!view) return;
      snapCamera(view);
    });
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return btn;
  };
  const axis = (label: string, color: string, transform: string) => {
    const wrap = document.createElement("div");
    wrap.className = `archmap-view-axis archmap-view-axis-${label.toLowerCase()}`;
    wrap.style.cssText =
      `position:absolute;left:32px;top:32px;width:50px;height:14px;transform-origin:left center;transform:${transform};` +
      "transform-style:preserve-3d;pointer-events:none;";
    const rod = document.createElement("div");
    rod.style.cssText =
      `position:absolute;left:0;top:6px;width:34px;height:2px;background:${color};box-shadow:0 0 0 1px rgba(255,255,255,0.72);`;
    const tip = document.createElement("div");
    tip.textContent = label;
    tip.style.cssText =
      `position:absolute;left:34px;top:0;color:${color};font:800 11px system-ui,sans-serif;text-shadow:0 1px 2px #fff;`;
    wrap.append(rod, tip);
    return wrap;
  };
  cubeBody.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  cubeBody.addEventListener("pointerup", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if ((event.target as HTMLElement).dataset.view) return;
    const rect = cubeBody.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    snapCamera(y < rect.height * 0.34 ? "top" : x > rect.width * 0.58 ? "right" : "front");
  });
  cubeBody.append(
    face("正面", "front", "translateZ(32px)"),
    face("", undefined, "rotateY(180deg) translateZ(32px)"),
    face("上面", "top", "rotateX(90deg) translateZ(32px)"),
    face("", undefined, "rotateX(-90deg) translateZ(32px)"),
    face("右側", "right", "rotateY(90deg) translateZ(32px)"),
    face("", undefined, "rotateY(-90deg) translateZ(32px)"),
    axis("X", "#dc2626", "translate3d(30px,0,0)"),
    axis("Y", "#16a34a", "rotateZ(-90deg) translate3d(30px,0,0)"),
    axis("Z", "#2563eb", "rotateY(-90deg) translate3d(30px,0,0)"),
  );
  cube.appendChild(cubeBody);
  el.appendChild(cube);

  renderer.autoClear = false;
  const cubeQuat = new THREE.Quaternion();
  const cubeEuler = new THREE.Euler();
  const updateViewCube = () => {
    cubeQuat.copy(camera.quaternion).invert();
    cubeEuler.setFromQuaternion(cubeQuat, "XYZ");
    cubeBody.style.transform =
      `rotateX(${THREE.MathUtils.radToDeg(cubeEuler.x)}deg) ` +
      `rotateY(${THREE.MathUtils.radToDeg(cubeEuler.y)}deg) ` +
      `rotateZ(${THREE.MathUtils.radToDeg(cubeEuler.z)}deg)`;
  };

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const delta = clock.getDelta();
    if (snap) {
      snap.elapsed += delta;
      const t = ease(Math.min(1, snap.elapsed / snap.duration));
      camera.position.lerpVectors(snap.fromPosition, snap.toPosition, t);
      camera.up.lerpVectors(snap.fromUp, snap.toUp, t).normalize();
      camera.lookAt(center);
      if (t >= 1) snap = undefined;
    }
    controls.update();
    updateViewCube();
    renderer.clear();
    renderer.render(scene, camera);
  };
  tick();

  const onResize = () => {
    const w = el.clientWidth || width;
    const h = el.clientHeight || height;
    const nextAspect = w / h;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = -frustum * nextAspect / 2;
      camera.right = frustum * nextAspect / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
    } else {
      camera.aspect = nextAspect;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(el);

  return {
    exportPng() {
      renderer.clear();
      renderer.render(scene, camera);
      return new Promise<Blob>((resolve, reject) => {
        renderer.domElement.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create PNG blob from the 3D canvas."));
        }, "image/png");
      });
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("wheel", onWheel, { capture: true });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cube.remove();
    },
  };
}

/** Register the "3d" view. Call once before rendering with view: "3d". */
export function installThreeView(): void {
  registerView("3d", (ctx: ViewContext): MountableView => ({
    mount: (target) => mountScene(target, ctx),
  }));
}
