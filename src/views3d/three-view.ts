/**
 * SAMPLE 3D view — NOT part of the core bundle. Opt in:
 *
 *   import { installThreeView } from "archmap/views3d/three-view";
 *   installThreeView();
 *   ArchMap.render(model, { view: "3d", target: el });  // returns { handle }
 *
 * Requires `three` as a peer dependency. Consumes the same LayoutResult as the
 * 2D views; `z` (layer depth) becomes height. Zones render as translucent
 * labeled volumes (non-overlapping, thanks to layout swimlanes); nodes carry
 * the same provider/kind icons as 2D; a corner gizmo snaps to top/front/side.
 * The returned handle owns the canvas + animation loop — call handle.dispose().
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { registerView, resolveNodeIcons } from "archmap";
import type { MountableView, ViewContext, ViewHandle, RenderableIcon } from "archmap";
import { buildScene3D } from "./scene.js";
import type { Scene3D } from "./scene.js";
import { buildOverlayProjection } from "../views/overlays.js";
import type { Box } from "../views/base.js";

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
}

function makeTextSprite(text: string, opts: LabelOpts = {}): THREE.Sprite {
  const fg = opts.fg ?? "#1c2733";
  const bg = opts.bg ?? "rgba(255,255,255,0.92)";
  const scaleY = opts.scaleY ?? 0.5;
  const pad = 8;
  const font = `${opts.bold ? "600 " : ""}28px system-ui, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const tw = Math.ceil(measure.measureText(text).width);
  const canvas = document.createElement("canvas");
  canvas.width = tw + pad * 2;
  canvas.height = 40;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, canvas.height / 2);
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
  const projection = buildOverlayProjection(ctx.model, ctx.layout, ctx.options.overlays ?? []);
  const emphasizeNodes = projection.emphasizeNodes ?? new Set<string>();
  const emphasizeEdges = projection.emphasizeEdges ?? new Set<string>();
  const badges = projection.nodeBadges ?? new Map<string, string>();
  const nodeById = new Map(scene3d.nodes.map((n) => [n.id, n]));

  // Nodes as boxes + labels.
  for (const n of scene3d.nodes) {
    const geo = track(new THREE.BoxGeometry(n.w, n.h, n.d));
    const mat = track(new THREE.MeshStandardMaterial({
      color: layerColor(n.layer),
      emissive: emphasizeNodes.has(n.id) ? 0x5c2d14 : 0x000000,
      emissiveIntensity: emphasizeNodes.has(n.id) ? 0.18 : 0,
      roughness: 0.82,
      metalness: 0,
      flatShading: true,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, n.y, n.z);
    root.add(mesh);

    // Provider/kind icon (same registry as 2D), as a billboard above the box.
    const icon = icons.get(n.id);
    const labelY = icon ? n.y + n.h / 2 + 0.95 : n.y + n.h / 2 + 0.45;
    if (icon) {
      const { sprite, texture } = makeIconSprite(icon);
      sprite.position.set(n.x - n.w / 2 + 0.38, n.y + n.h / 2 + 0.42, n.z - n.d / 2 + 0.38);
      disposables.push(texture, sprite.material);
      root.add(sprite);
    }

    const label = makeTextSprite(n.label);
    label.position.set(n.x, labelY, n.z);
    disposeSprite(label, disposables);
    root.add(label);

    const badge = badges.get(n.id);
    if (badge) {
      const badgeSprite = makeTextSprite(badge, { fg: "#7a4f9a", bg: "rgba(255,255,255,0.9)", scaleY: 0.42, bold: true });
      badgeSprite.position.set(n.x + n.w / 2 + 0.35, n.y + n.h / 2 + 0.38, n.z);
      disposeSprite(badgeSprite, disposables);
      root.add(badgeSprite);
    }
  }

  // Edges as lines.
  for (const e of scene3d.edges) {
    const isEmphasized = emphasizeEdges.has(e.id);
    const edgeMat = track(new THREE.LineBasicMaterial({
      color: isEmphasized ? EMPHASIS_EDGE_COLOR : 0x52617a,
      transparent: true,
      opacity: isEmphasized ? 0.95 : 0.58,
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

  // Zones as translucent volumes enclosing their members, with wireframe edges
  // and a label floating above. depthWrite:false so they never hide nodes.
  scene3d.zones.forEach((z, i) => {
    const color = ZONE_COLORS[i % ZONE_COLORS.length];
    const geo = track(new THREE.BoxGeometry(z.w, z.h, z.d));
    const mat = track(
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(z.x, z.y, z.z);
    mesh.renderOrder = -1;
    root.add(mesh);

    const eg = track(new THREE.EdgesGeometry(geo));
    const line = new THREE.LineSegments(eg, track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })));
    line.position.copy(mesh.position);
    root.add(line);

    const hex = "#" + color.toString(16).padStart(6, "0");
    const label = makeTextSprite(z.label ?? z.id, { fg: hex, bg: "rgba(255,255,255,0.82)", scaleY: 0.62, bold: true });
    label.position.set(z.labelX, z.labelY, z.labelZ);
    disposeSprite(label, disposables);
    root.add(label);
  });

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

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

  const scene3d = buildScene3D(ctx.layout, { scale: SCENE_SCALE });
  const iconMap = new Map([...resolveNodeIcons(ctx.model)].map(([id, r]) => [id, r.icon]));
  const { root, disposables } = buildSceneGraph(ctx, scene3d, iconMap);
  scene.add(root);

  // Ground grid sized to the scene footprint.
  const span = Math.max(
    scene3d.bounds.max.x - scene3d.bounds.min.x,
    scene3d.bounds.max.z - scene3d.bounds.min.z,
    4,
  );
  const floorGeo = new THREE.PlaneGeometry(span * 1.45, span * 1.45);
  const floorMat = new THREE.MeshBasicMaterial({ color: 0xf7f9fc, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.72;
  scene.add(floor);

  const grid = new THREE.GridHelper(Math.ceil(span * 1.4), 20, 0xc9d3e3, 0xe5eaf2);
  grid.position.y = -0.69;
  scene.add(grid);

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
  controls.screenSpacePanning = true;
  controls.update();

  const snapCamera = (view: "top" | "front" | "side") => {
    const offset = view === "top"
      ? new THREE.Vector3(0, dist, 0.001)
      : view === "front"
        ? new THREE.Vector3(0, 0, dist)
        : new THREE.Vector3(dist, 0, 0);
    camera.position.copy(center).add(offset);
    camera.up.set(0, 1, 0);
    if (view === "top") camera.up.set(0, 0, -1);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  };

  const gizmo = document.createElement("div");
  gizmo.className = "archmap-view-gizmo";
  gizmo.style.cssText =
    "position:absolute;right:12px;top:12px;z-index:4;display:flex;gap:6px;padding:6px;" +
    "border:1px solid rgba(148,163,184,0.45);border-radius:8px;background:rgba(255,255,255,0.9);" +
    "box-shadow:0 10px 28px rgba(28,39,51,0.14);backdrop-filter:blur(8px);";
  const makeGizmoButton = (label: string, view: "top" | "front" | "side") => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = `Snap camera to ${label.toLowerCase()} view`;
    btn.style.cssText =
      "min-width:44px;min-height:28px;border:1px solid #cbd5e1;border-radius:999px;" +
      "background:#f8fafc;color:#334155;font:700 12px system-ui,sans-serif;cursor:pointer;";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      snapCamera(view);
    });
    return btn;
  };
  gizmo.append(makeGizmoButton("Top", "top"), makeGizmoButton("Front", "front"), makeGizmoButton("Side", "side"));
  el.appendChild(gizmo);

  // Orientation gizmo in the corner. Clicking an axis snaps the camera to that
  // view (top / front / side); it animates around the scene center.
  const viewHelper = new ViewHelper(camera, renderer.domElement);
  viewHelper.center.copy(center);
  renderer.autoClear = false;
  const clock = new THREE.Clock();

  // A click on the gizmo triggers a camera animation; otherwise OrbitControls.
  const onPointerUp = (event: PointerEvent) => {
    viewHelper.handleClick(event);
  };
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const delta = clock.getDelta();
    if (viewHelper.animating) viewHelper.update(delta);
    controls.update();
    renderer.clear();
    renderer.render(scene, camera);
    viewHelper.render(renderer);
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
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      viewHelper.dispose();
      controls.dispose();
      for (const d of disposables) d.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      gizmo.remove();
    },
  };
}

/** Register the "3d" view. Call once before rendering with view: "3d". */
export function installThreeView(): void {
  registerView("3d", (ctx: ViewContext): MountableView => ({
    mount: (target) => mountScene(target, ctx),
  }));
}
