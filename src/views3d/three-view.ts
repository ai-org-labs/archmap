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
import { registerView } from "../render.js";
import type { MountableView, ViewContext, ViewHandle } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import type { RenderableIcon } from "../icons.js";
import { buildScene3D } from "./scene.js";
import type { Scene3D } from "./scene.js";

/** Per-layer color ramp (client → external), §10 order. */
const LAYER_COLORS = [
  0x4f86c6, 0x49a0a0, 0x5bb36b, 0xc6913f, 0xb06ec6,
  0xc65a72, 0x6b7bbf, 0x8a8f9c, 0x9c9c5b,
];

/** Per-zone color ramp, so AWS / GCP / client volumes read distinctly. */
const ZONE_COLORS = [
  0x4285f4, 0xff9900, 0x3b8c4d, 0x7c4dff, 0x00897b, 0xc2185b,
];

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

function buildSceneGraph(scene3d: Scene3D, icons: Map<string, RenderableIcon>): {
  root: THREE.Group;
  disposables: { dispose(): void }[];
} {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Nodes as boxes + labels.
  for (const n of scene3d.nodes) {
    const geo = track(new THREE.BoxGeometry(n.w, n.h, n.d));
    const mat = track(new THREE.MeshStandardMaterial({ color: layerColor(n.layer), roughness: 0.55, metalness: 0.05 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, n.y, n.z);
    root.add(mesh);

    // Provider/kind icon (same registry as 2D), as a billboard above the box.
    const icon = icons.get(n.id);
    const labelY = icon ? n.y + n.h / 2 + 0.95 : n.y + n.h / 2 + 0.45;
    if (icon) {
      const { sprite, texture } = makeIconSprite(icon);
      sprite.position.set(n.x, n.y + n.h / 2 + 0.4, n.z);
      disposables.push(texture, sprite.material);
      root.add(sprite);
    }

    const label = makeTextSprite(n.label);
    label.position.set(n.x, labelY, n.z);
    if (label.material.map) disposables.push(label.material.map);
    disposables.push(label.material);
    root.add(label);
  }

  // Edges as lines.
  const edgeMat = track(new THREE.LineBasicMaterial({ color: 0x6678a0, transparent: true, opacity: 0.7 }));
  for (const e of scene3d.edges) {
    const geo = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(e.a.x, e.a.y, e.a.z),
        new THREE.Vector3(e.b.x, e.b.y, e.b.z),
      ]),
    );
    root.add(new THREE.Line(geo, edgeMat));
  }

  // Zones as translucent volumes enclosing their members, with wireframe edges
  // and a label floating above. depthWrite:false so they never hide nodes.
  scene3d.zones.forEach((z, i) => {
    const color = ZONE_COLORS[i % ZONE_COLORS.length];
    const geo = track(new THREE.BoxGeometry(z.w, z.h, z.d));
    const mat = track(
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(z.x, z.y, z.z);
    mesh.renderOrder = -1;
    root.add(mesh);

    const eg = track(new THREE.EdgesGeometry(geo));
    const line = new THREE.LineSegments(eg, track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })));
    line.position.copy(mesh.position);
    root.add(line);

    const hex = "#" + color.toString(16).padStart(6, "0");
    const label = makeTextSprite(z.label ?? z.id, { fg: hex, bg: "rgba(255,255,255,0.82)", scaleY: 0.62, bold: true });
    label.position.set(z.x, z.y + z.h / 2 + 0.55, z.z);
    if (label.material.map) disposables.push(label.material.map);
    disposables.push(label.material);
    root.add(label);
  });

  return { root, disposables };
}

function mountScene(target: Element, ctx: ViewContext): ViewHandle {
  const el = target as HTMLElement;
  el.innerHTML = "";
  const width = el.clientWidth || 800;
  const height = el.clientHeight || 520;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 12, 8);
  scene.add(dir);

  const scene3d = buildScene3D(ctx.layout);
  const iconMap = new Map([...resolveNodeIcons(ctx.model)].map(([id, r]) => [id, r.icon]));
  const { root, disposables } = buildSceneGraph(scene3d, iconMap);
  scene.add(root);

  // Ground grid sized to the scene footprint.
  const span = Math.max(
    scene3d.bounds.max.x - scene3d.bounds.min.x,
    scene3d.bounds.max.z - scene3d.bounds.min.z,
    4,
  );
  const grid = new THREE.GridHelper(Math.ceil(span * 1.4), 20, 0xc5cde0, 0xe2e7f0);
  grid.position.y = -0.7;
  scene.add(grid);

  // Frame the camera on the scene center.
  const b = scene3d.bounds;
  const center = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 4);
  const dist = size * 0.85 + 5;
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.5, center.z + dist * 0.85);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.update();

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
    camera.aspect = w / h;
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
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Register the "3d" view. Call once before rendering with view: "3d". */
export function installThreeView(): void {
  registerView("3d", (ctx: ViewContext): MountableView => ({
    mount: (target) => mountScene(target, ctx),
  }));
}
