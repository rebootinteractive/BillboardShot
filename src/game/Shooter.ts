import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

export type ShooterState = 'queue' | 'walking' | 'deck' | 'retiring' | 'gone';

let SHOOTER_ID = 0;

/**
 * A container. It carries a capacity — `charges` is the room it has left — and on
 * the deck it pulls matching cubes out of the focused billboard until it is full.
 *
 * Cubes it has caught stack up out of its open top. Only the newest few stay in
 * view: each arrival pushes the pile down, and a cube pushed below the rim sinks
 * into the container and is gone.
 */
export class Shooter {
  readonly id = ++SHOOTER_ID;
  readonly group = new THREE.Group();
  readonly color: ColorKey;

  /** Room left. The container leaves the deck once this reaches 0. */
  charges: number;
  state: ShooterState = 'queue';
  /** Deck slot index while on the deck, else -1. */
  slot = -1;
  /** Queue lane index while queueing, else -1. */
  lane = -1;
  cooldown = 0;
  /** Cubes pulled but still in the air on their way here. */
  inFlight = 0;
  retireT = 0;
  /** Seconds spent full, so the last cube is seen landing before it leaves. */
  fullT = 0;
  private active = false;

  readonly target = new THREE.Vector3();

  private readonly width: number;
  private readonly rimY: number;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly holeMat: THREE.MeshBasicMaterial;
  private readonly bodyGeo: THREE.BoxGeometry;
  private readonly rimGeo: THREE.BoxGeometry;
  private readonly holeGeo: THREE.PlaneGeometry;
  private readonly badge: THREE.Sprite;
  private readonly badgeCanvas: HTMLCanvasElement;
  private readonly badgeTex: THREE.CanvasTexture;
  private readonly badgeMat: THREE.SpriteMaterial;
  private badgeShown = -1;
  private readonly hitMesh: THREE.Mesh;
  private readonly hitGeo: THREE.BoxGeometry;

  /** Caught cubes, oldest first. Their geometry belongs to the billboard they came from. */
  private readonly cubes: THREE.Mesh[] = [];
  private cubeStep = 0.2;

  constructor(color: ColorKey, charges: number, scale: number) {
    this.color = color;
    this.charges = charges;
    this.width = 0.62 * scale;
    const height = 0.46 * scale;
    this.rimY = height;

    this.bodyGeo = new THREE.BoxGeometry(this.width, height, this.width);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: COLOR_HEX[color], roughness: 0.5 });
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = height / 2;
    this.group.add(body);

    // A lip around the top, and a dark square inside it, so it reads as open.
    const lip = 0.06 * scale;
    this.rimGeo = new THREE.BoxGeometry(this.width + lip, lip, this.width + lip);
    this.rimMat = new THREE.MeshStandardMaterial({ color: COLOR_HEX[color], roughness: 0.35 });
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    rim.position.y = height;
    this.group.add(rim);

    this.holeGeo = new THREE.PlaneGeometry(this.width * 0.8, this.width * 0.8);
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x0d0f15 });
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = height + lip / 2 + 0.002;
    this.group.add(hole);

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
    this.badge.position.y = this.rimY + 0.3 * scale;
    this.badge.renderOrder = 5;
    this.group.add(this.badge);
    this.refreshBadge();
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

  /** Where an incoming cube should head: the top of the visible pile, in world space. */
  landingPoint(visible: number, out: THREE.Vector3): THREE.Vector3 {
    const pile = Math.min(this.cubes.length + this.inFlight, visible);
    out.set(0, this.rimY + (pile + 0.5) * this.cubeStep, 0);
    return this.group.localToWorld(out);
  }

  /** Take ownership of a cube that has just arrived. */
  receiveCube(mesh: THREE.Mesh, step: number) {
    this.cubeStep = step;
    this.group.attach(mesh);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
    this.cubes.push(mesh);
  }

  /**
   * Settle the pile. The newest `visible` cubes rest on the rim, stacked upward;
   * anything older has been pushed out of view and sinks into the container,
   * shrinking as it goes, and is dropped once it has all but vanished. A cube
   * starts shrinking the moment it leaves the window rather than when it reaches
   * the rim, so a burst of arrivals never shows more than `visible` at full size.
   */
  updateStack(dt: number, visible: number) {
    const k = 1 - Math.exp(-18 * dt);
    const step = this.cubeStep;
    const firstVisible = Math.max(0, this.cubes.length - visible);
    for (let i = this.cubes.length - 1; i >= 0; i--) {
      const m = this.cubes[i];
      const slot = i - firstVisible; // negative = pushed out of view, into the container
      const targetY = this.rimY + (slot + 0.5) * step;
      m.position.x += (0 - m.position.x) * k;
      m.position.z += (0 - m.position.z) * k;
      m.position.y += (targetY - m.position.y) * k;
      if (slot >= 0) {
        m.scale.setScalar(1);
        continue;
      }
      const next = m.scale.x * (1 - k);
      if (next < 0.04) {
        m.parent?.remove(m);
        this.cubes.splice(i, 1);
      } else {
        m.scale.setScalar(next);
      }
    }
    const shown = Math.min(this.cubes.length, visible);
    const badgeY = this.rimY + shown * step + 0.3;
    this.badge.position.y += (badgeY - this.badge.position.y) * k;
  }

  /** Walk toward the assigned target position. Returns true once it has arrived. */
  moveToward(dt: number, speed: number): boolean {
    const d = this.group.position.distanceTo(this.target);
    if (d < 0.004) {
      this.group.position.copy(this.target);
      return true;
    }
    const s = speed * dt;
    if (s >= d) {
      this.group.position.copy(this.target);
      return true;
    }
    this.group.position.lerp(this.target, s / d);
    return false;
  }

  setTapTargetEnabled(on: boolean) {
    this.hitMesh.userData.tappable = on;
  }

  /**
   * Marks the one container of its color currently allowed to pull. Its own material
   * instances, so the glow never bleeds onto the others.
   */
  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    const glow = on ? 0x2a2a2a : 0x000000;
    this.bodyMat.emissive.setHex(glow);
    this.rimMat.emissive.setHex(glow);
  }

  dispose() {
    // Caught cubes are billboard meshes; their geometry and material are the board's.
    for (const m of this.cubes) m.parent?.remove(m);
    this.cubes.length = 0;
    this.group.parent?.remove(this.group);
    this.bodyGeo.dispose();
    this.bodyMat.dispose();
    this.rimGeo.dispose();
    this.rimMat.dispose();
    this.holeGeo.dispose();
    this.holeMat.dispose();
    this.hitGeo.dispose();
    (this.hitMesh.material as THREE.Material).dispose();
    this.badgeTex.dispose();
    this.badgeMat.dispose();
  }
}
