import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

export type ShooterState = 'queue' | 'walking' | 'deck' | 'retiring' | 'gone';

let SHOOTER_ID = 0;

export class Shooter {
  readonly id = ++SHOOTER_ID;
  readonly group = new THREE.Group();
  readonly color: ColorKey;

  charges: number;
  state: ShooterState = 'queue';
  /** Deck slot index while on the deck, else -1. */
  slot = -1;
  /** Queue lane index while queueing, else -1. */
  lane = -1;
  cooldown = 0;
  /** Projectiles still in the air from this shooter. */
  inFlight = 0;
  retireT = 0;

  readonly target = new THREE.Vector3();

  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly barrelMat: THREE.MeshStandardMaterial;
  private readonly bodyGeo: THREE.CylinderGeometry;
  private readonly barrelGeo: THREE.CylinderGeometry;
  private readonly badge: THREE.Sprite;
  private readonly badgeCanvas: HTMLCanvasElement;
  private readonly badgeTex: THREE.CanvasTexture;
  private readonly badgeMat: THREE.SpriteMaterial;
  private badgeShown = -1;
  private readonly hitMesh: THREE.Mesh;
  private readonly hitGeo: THREE.BoxGeometry;

  constructor(color: ColorKey, charges: number, scale: number) {
    this.color = color;
    this.charges = charges;

    this.bodyGeo = new THREE.CylinderGeometry(0.3 * scale, 0.36 * scale, 0.5 * scale, 14);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: COLOR_HEX[color], roughness: 0.45 });
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = 0.25 * scale;
    this.group.add(body);

    this.barrelGeo = new THREE.CylinderGeometry(0.11 * scale, 0.17 * scale, 0.42 * scale, 12);
    this.barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2f40, roughness: 0.4, metalness: 0.3 });
    const barrel = new THREE.Mesh(this.barrelGeo, this.barrelMat);
    barrel.position.y = 0.68 * scale;
    this.group.add(barrel);

    // Invisible, generous tap target.
    this.hitGeo = new THREE.BoxGeometry(0.8 * scale, 0.9 * scale, 0.6 * scale);
    this.hitMesh = new THREE.Mesh(this.hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.position.y = 0.42 * scale;
    this.hitMesh.userData.shooterId = this.id;
    this.group.add(this.hitMesh);

    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 96;
    this.badgeCanvas.height = 96;
    this.badgeTex = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeMat = new THREE.SpriteMaterial({ map: this.badgeTex, depthTest: false, transparent: true });
    this.badge = new THREE.Sprite(this.badgeMat);
    this.badge.scale.setScalar(0.42 * scale);
    this.badge.position.y = 1.05 * scale;
    this.badge.renderOrder = 5;
    this.group.add(this.badge);
    this.refreshBadge();
  }

  get muzzleOffsetY() {
    return this.bodyGeo.parameters.height + 0.5;
  }

  refreshBadge() {
    if (this.badgeShown === this.charges) return;
    this.badgeShown = this.charges;
    const ctx = this.badgeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 96, 96);
    ctx.beginPath();
    ctx.arc(48, 48, 40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(13,15,21,0.88)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px -apple-system, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.charges), 48, 52);
    this.badgeTex.needsUpdate = true;
  }

  /** Walk toward the assigned target position. Returns true once it has arrived. */
  moveToward(dt: number, speed: number): boolean {
    const d = this.group.position.distanceTo(this.target);
    if (d < 0.004) {
      this.group.position.copy(this.target);
      return true;
    }
    const step = speed * dt;
    if (step >= d) {
      this.group.position.copy(this.target);
      return true;
    }
    this.group.position.lerp(this.target, step / d);
    return false;
  }

  setTapTargetEnabled(on: boolean) {
    this.hitMesh.userData.tappable = on;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.bodyGeo.dispose();
    this.bodyMat.dispose();
    this.barrelGeo.dispose();
    this.barrelMat.dispose();
    this.hitGeo.dispose();
    (this.hitMesh.material as THREE.Material).dispose();
    this.badgeTex.dispose();
    this.badgeMat.dispose();
  }
}
