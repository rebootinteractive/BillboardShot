import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_CSS } from '../shared/colors';

/** Key colors are their own palette, so a key never reads as a pixel color. */
export type KeyColor = 'gold' | 'silver' | 'bronze';
export const KEY_COLORS: KeyColor[] = ['gold', 'silver', 'bronze'];

export const KEY_HEX: Record<KeyColor, number> = {
  gold: 0xf5b82e,
  silver: 0xaab7c4,
  bronze: 0xc8783f,
};

const KEY_CSS: Record<KeyColor, string> = {
  gold: '#f5b82e',
  silver: '#aab7c4',
  bronze: '#c8783f',
};

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A key glyph on a transparent background, outlined so it reads on any pixel color. */
export function keyTexture(color: KeyColor) {
  return canvasTexture(128, (ctx) => {
    const path = () => {
      ctx.beginPath();
      ctx.arc(40, 64, 22, 0, Math.PI * 2);
      ctx.moveTo(60, 64);
      ctx.lineTo(112, 64);
      ctx.moveTo(98, 64);
      ctx.lineTo(98, 86);
      ctx.moveTo(84, 64);
      ctx.lineTo(84, 80);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 26;
    ctx.stroke();
    path();
    ctx.strokeStyle = KEY_CSS[color];
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(40, 64, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
  });
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
 * A collected key traveling from its container to the padlock it opens. The lock
 * opens when it arrives.
 */
export class KeyFlight {
  readonly color: KeyColor;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly from = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private t = 0;

  constructor(
    private readonly world: THREE.Object3D,
    from: THREE.Vector3,
    private readonly target: THREE.Object3D,
    color: KeyColor,
    private readonly camera: THREE.Camera,
  ) {
    this.color = color;
    const texture = keyTexture(color);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 20;
    this.from.copy(from);
    this.mesh.position.copy(from);
    world.add(this.mesh);
  }

  /** Returns true when the key has reached its lock. */
  update(dt: number): boolean {
    this.t = Math.min(1, this.t + dt / 0.75);
    this.target.getWorldPosition(this.to);
    this.world.worldToLocal(this.to);
    this.ctrl.copy(this.from).lerp(this.to, 0.5);
    this.ctrl.y += 1.6;
    const t = this.t * this.t * (3 - 2 * this.t);
    const u = 1 - t;
    this.mesh.position.set(
      u * u * this.from.x + 2 * u * t * this.ctrl.x + t * t * this.to.x,
      u * u * this.from.y + 2 * u * t * this.ctrl.y + t * t * this.to.y,
      u * u * this.from.z + 2 * u * t * this.ctrl.z + t * t * this.to.z,
    );
    this.mesh.quaternion.copy(this.camera.quaternion);
    this.mesh.rotateZ(Math.sin(t * Math.PI) * 0.8);
    this.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.5);
    return this.t >= 1;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}
