import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_CSS } from '../shared/colors';

import type { KeyColor } from '../shared/keyColors';
import { KEY_HEIGHT, KEY_WIDTH } from './level';
import { roundedBox } from './visuals';
export { KEY_COLORS, type KeyColor } from '../shared/keyColors';

export const KEY_HEX: Record<KeyColor, number> = {
  gold: 0xf5b82e,
  silver: 0xaab7c4,
  bronze: 0xc8783f,
};

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The outline of a key lying on its side, bow on the left and teeth hanging from the tip,
 * filling a 3 × 2 cell area centered on the origin. The bow has a hole through it.
 */
function keyShape(cell: number): THREE.Shape {
  const r = 0.74 * cell;
  const bx = -1.5 * cell + r + 0.04 * cell;
  const t = 0.19 * cell;
  const tip = 1.44 * cell;
  const a = Math.asin(t / r);
  const shape = new THREE.Shape();
  shape.moveTo(bx + r * Math.cos(a), t);
  shape.lineTo(tip, t);
  shape.lineTo(tip, -0.66 * cell);
  shape.lineTo(1.04 * cell, -0.66 * cell);
  shape.lineTo(1.04 * cell, -t);
  shape.lineTo(0.86 * cell, -t);
  shape.lineTo(0.86 * cell, -0.5 * cell);
  shape.lineTo(0.5 * cell, -0.5 * cell);
  shape.lineTo(0.5 * cell, -t);
  shape.lineTo(bx + r * Math.cos(a), -t);
  // Around the far side of the bow, back to the top of the shaft.
  shape.absarc(bx, 0, r, -a, a - Math.PI * 2, true);
  const hole = new THREE.Path();
  hole.absarc(bx, 0, 0.3 * cell, 0, Math.PI * 2, false);
  shape.holes.push(hole);
  return shape;
}

/**
 * A key as it sits on a billboard: a metal key in its key color on a pale plate, 3 cells
 * wide and 2 tall, centered on the origin. The plate is named 'plate' so a flight can
 * shrink it away while the key itself travels on.
 */
export function keyObject(color: KeyColor, cell: number): THREE.Group {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    roundedBox(KEY_WIDTH * cell * 0.96, KEY_HEIGHT * cell * 0.96, cell * 0.5, cell * 0.16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(KEY_HEX[color]).lerp(new THREE.Color(0xfff7e8), 0.78), roughness: 0.5 }),
  );
  plate.name = 'plate';
  plate.position.z = -cell * 0.1;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);
  const depth = cell * 0.22;
  const geo = new THREE.ExtrudeGeometry(keyShape(cell * 0.94), {
    depth, bevelEnabled: true, bevelThickness: cell * 0.06, bevelSize: cell * 0.05, bevelSegments: 2, curveSegments: 20,
  });
  const key = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: KEY_HEX[color], roughness: 0.28, metalness: 0.4 }));
  key.name = 'key';
  key.position.z = cell * 0.18;
  key.castShadow = true;
  group.add(key);
  return group;
}

/** The gray "?" face of a mystery pixel. */
export function mysteryTexture() {
  return canvasTexture(64, (ctx) => {
    ctx.fillStyle = '#b3bac3';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#f4f6f8';
    ctx.font = 'bold 44px -apple-system, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 36);
  });
}

/** A round label: an optional color swatch or snowflake, then a number. */
export function drawCounter(ctx: CanvasRenderingContext2D, value: string, opts: { swatch?: ColorKey; icy?: boolean }) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  const r = h / 2 - 6;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, r);
  ctx.fillStyle = opts.icy ? '#f2fbff' : '#fff7e8';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = opts.icy ? '#8fd3f0' : 'rgba(113,72,43,0.14)';
  ctx.stroke();
  let textX = w / 2;
  if (opts.swatch) {
    ctx.beginPath();
    ctx.arc(h / 2, h / 2, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_CSS[opts.swatch];
    ctx.fill();
    textX = h + (w - h) / 2 - 8;
  }
  ctx.fillStyle = opts.icy ? '#3a8db5' : '#684b3d';
  ctx.font = `bold ${Math.round(h * 0.56)}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, textX, h / 2 + 3);
}

/**
 * A released key traveling from its board to the padlock it opens. It takes the key
 * object off the board as it is, sheds the plate, and turns to face the camera on the
 * way. The lock opens when it arrives.
 */
export class KeyFlight {
  readonly color: KeyColor;
  private readonly from = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly startRotation = new THREE.Quaternion();
  private readonly facing = new THREE.Quaternion();
  private readonly plate: THREE.Object3D | undefined;
  private readonly baseScale: number;
  private t = 0;

  constructor(
    private readonly world: THREE.Object3D,
    private readonly object: THREE.Object3D,
    private readonly target: THREE.Object3D,
    color: KeyColor,
    private readonly camera: THREE.Camera,
  ) {
    this.color = color;
    world.attach(object);
    object.traverse((o) => { o.renderOrder = 20; });
    this.from.copy(object.position);
    this.startRotation.copy(object.quaternion);
    this.baseScale = object.scale.x;
    this.plate = object.getObjectByName('plate');
  }

  /** Returns true when the key has reached its lock. */
  update(dt: number): boolean {
    this.t = Math.min(1, this.t + dt / 0.8);
    this.target.getWorldPosition(this.to);
    this.world.worldToLocal(this.to);
    this.ctrl.copy(this.from).lerp(this.to, 0.5);
    this.ctrl.y += 1.6;
    const t = this.t * this.t * (3 - 2 * this.t);
    const u = 1 - t;
    this.object.position.set(
      u * u * this.from.x + 2 * u * t * this.ctrl.x + t * t * this.to.x,
      u * u * this.from.y + 2 * u * t * this.ctrl.y + t * t * this.to.y,
      u * u * this.from.z + 2 * u * t * this.ctrl.z + t * t * this.to.z,
    );
    // The world may be turned; face the camera in the world's own frame.
    this.world.getWorldQuaternion(this.facing).invert().multiply(this.camera.quaternion);
    this.object.quaternion.copy(this.startRotation).slerp(this.facing, THREE.MathUtils.smoothstep(this.t, 0, 0.35));
    this.object.rotateZ(Math.sin(t * Math.PI) * 0.5);
    this.object.scale.setScalar(this.baseScale * (1 + Math.sin(t * Math.PI) * 0.35));
    if (this.plate) {
      const k = 1 - THREE.MathUtils.smoothstep(this.t, 0, 0.25);
      this.plate.scale.setScalar(Math.max(0.001, k));
      this.plate.visible = k > 0;
    }
    return this.t >= 1;
  }

  dispose() {
    this.object.removeFromParent();
    disposeObject(this.object);
  }
}

/** Free every geometry and material under an object built by keyObject. */
export function disposeObject(object: THREE.Object3D) {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}
