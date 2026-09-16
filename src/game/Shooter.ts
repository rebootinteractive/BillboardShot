import * as THREE from 'three';
import { roundedBox } from './visuals';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

export type ShooterState = 'queue' | 'walking' | 'deck' | 'retiring' | 'gone';

let SHOOTER_ID = 0;
const FACE_ROTATION = new THREE.Quaternion();
const HIDDEN_HEX = 0xb3bac3;

export interface ContainerTraits {
  hidden?: boolean;
}

/**
 * A container. It carries a capacity — `charges` is the room it has left — and on
 * the deck it pulls matching cubes out of the focused billboard until it is full.
 *
 * Collected pixels fill nine reserved cells per layer, then begin the next layer.
 * Reservations keep simultaneous arrivals in distinct places even out of order.
 */
export class Shooter {
  readonly id = ++SHOOTER_ID;
  readonly group = new THREE.Group();
  readonly color: ColorKey;

  /** Room left. The container leaves the deck once this reaches 0. */
  charges: number;
  /** Room it started with: the pixels it holds once full. */
  readonly capacity: number;
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
  /** Color and charges are hidden until it reaches the head of its lane. */
  hidden: boolean;
  /** The container it is linked to, sent together from the queue. */
  partner: Shooter | null = null;
  /** The link id from the level file, used to pair partners while building. */
  userLink: string | null = null;
  private revealT = 1;
  private active = false;
  private readonly visual = new THREE.Group();
  private spring = 0;
  private springVelocity = 0;
  private pressed = false;
  private rejectT = 0;
  private travelT = 0;
  private travelDuration = 0;
  private readonly travelFrom = new THREE.Vector3();
  private readonly lidHinge = new THREE.Group();
  private readonly badgeRotation = new THREE.Quaternion();
  private deployment = 0;
  private readonly queueBadgeY: number;
  private readonly badgeSize: number;

  press(on: boolean) { this.pressed = on; }
  bounce(amount = 1) { this.springVelocity -= amount * 2.8; }
  reject() { this.rejectT = 0.35; }

  beginTravel() {
    this.travelFrom.copy(this.group.position);
    this.travelT = 0;
    this.travelDuration = Math.max(0.3, this.travelFrom.distanceTo(this.target) / 5.5);
    this.pressed = false;
    this.bounce(0.8);
  }

  /** Show the real color and charges, as it reaches the head of its lane. */
  reveal() {
    if (!this.hidden) return;
    this.hidden = false;
    this.revealT = 0;
    this.refreshBadge();
    this.bounce(1.2);
  }

  private tintMaterials(amount: number) {
    const real = new THREE.Color(COLOR_HEX[this.color]);
    const hidden = new THREE.Color(HIDDEN_HEX);
    const base = hidden.clone().lerp(real, amount);
    this.bodyMat.color.copy(base);
    this.rimMat.color.copy(base).lerp(new THREE.Color(0xffffff), 0.22);
    this.lidMat.color.copy(base).lerp(new THREE.Color(0xffffff), 0.12);
    this.holeMat.color.copy(base).multiplyScalar(0.35);
  }

  updateVisual(dt: number, cameraRotation: THREE.Quaternion) {
    if (this.revealT < 1) {
      this.revealT = Math.min(1, this.revealT + dt / 0.3);
      this.tintMaterials(THREE.MathUtils.smoothstep(this.revealT, 0, 1));
    }
    this.springVelocity += (-160 * this.spring - 16 * this.springVelocity) * dt;
    this.spring += this.springVelocity * dt;
    const compression = this.spring - (this.pressed ? 0.1 : 0);
    this.visual.scale.set(1 - compression * 0.42, 1 + compression, 1 - compression * 0.42);
    this.rejectT = Math.max(0, this.rejectT - dt);
    this.visual.rotation.z = Math.sin(this.rejectT * 60) * this.rejectT * 0.2;

    this.deployment = this.state === 'queue' ? 0
      : this.state === 'walking' ? THREE.MathUtils.smoothstep(this.travelT, 0.18, 0.92) : 1;
    // Open away from the camera, leaving the entire 3×3 opening clear.
    this.lidHinge.rotation.x = -this.deployment * Math.PI * 0.61
      - Math.sin(this.deployment * Math.PI) * 0.12;
    // The same counter travels down to become a label on the front wall.
    this.badge.position.set(0,
      THREE.MathUtils.lerp(this.queueBadgeY, this.rimY * 0.5, this.deployment),
      THREE.MathUtils.lerp(0, this.width / 2 + 0.008, this.deployment));
    this.badge.scale.setScalar(THREE.MathUtils.lerp(this.badgeSize, this.rimY * 0.88, this.deployment));
    this.visual.getWorldQuaternion(this.badgeRotation).invert();
    this.badge.quaternion.copy(this.badgeRotation).multiply(cameraRotation).slerp(FACE_ROTATION, this.deployment);
  }

  readonly target = new THREE.Vector3();

  private readonly width: number;
  private readonly rimY: number;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly holeMat: THREE.MeshBasicMaterial;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly rimGeo: THREE.BufferGeometry;
  private readonly holeGeo: THREE.BufferGeometry;
  private readonly lidGeo: THREE.BufferGeometry;
  private readonly lidMat: THREE.MeshStandardMaterial;
  private readonly badge: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly badgeGeo: THREE.PlaneGeometry;
  private readonly badgeCanvas: HTMLCanvasElement;
  private readonly badgeTex: THREE.CanvasTexture;
  private readonly badgeMat: THREE.MeshBasicMaterial;
  private badgeShown = '';
  private readonly hitMesh: THREE.Mesh;
  private readonly hitGeo: THREE.BoxGeometry;

  /** Caught cubes, oldest first. Their geometry belongs to the billboard they came from. */
  private readonly cubes: Array<{ mesh: THREE.Mesh; index: number; cell: number }> = [];
  private nextCell = 0;
  private highestLanded = -1;
  private readonly packedPosition = new THREE.Vector3();
  private readonly packedScale = new THREE.Vector3();

  reserveCell(): number { return this.nextCell++; }

  packingState() {
    return { lid: this.deployment === 0 ? 'closed' : this.deployment === 1 ? 'open' : 'opening',
      counter: this.deployment === 1 ? 'front' : this.deployment === 0 ? 'above-lid' : 'moving',
      columns: 3, rows: 3, reserved: this.nextCell, landed: this.cubes.length,
      cells: this.cubes.map(({ index }) => ({ index, layer: Math.floor(index / 9), row: Math.floor(index % 9 / 3), column: index % 3 })) };
  }

  /** Three columns across the opening, with a small gap between each pixel. */
  private get cubeStep() { return this.width * 0.76 / 3; }

  packingScale(cell: number, out: THREE.Vector3) {
    const size = this.cubeStep * 0.9;
    return out.set(size / (cell * 0.94), size / (cell * 0.94), size / (cell * 0.7));
  }

  private cellPosition(index: number, visible: number, out: THREE.Vector3) {
    const visibleLayers = Math.max(1, Math.ceil(visible / 9));
    const firstLayer = Math.max(0, Math.floor(this.highestLanded / 9) - visibleLayers + 1);
    const slot = index % 9;
    return out.set(
      (slot % 3 - 1) * this.cubeStep,
      this.rimY + 0.055 + (Math.floor(index / 9) - firstLayer + 0.5) * this.cubeStep,
      (Math.floor(slot / 3) - 1) * this.cubeStep,
    );
  }

  constructor(color: ColorKey, charges: number, scale: number, traits: ContainerTraits = {}) {
    this.color = color;
    this.charges = charges;
    this.capacity = charges;
    this.hidden = !!traits.hidden;
    this.width = 0.72 * scale;
    const height = 0.5 * scale;
    this.rimY = height;
    this.queueBadgeY = height + 0.3 * scale;
    this.badgeSize = 0.48 * scale;

    this.group.add(this.visual);
    this.bodyGeo = roundedBox(this.width, height, this.width, 0.075);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: COLOR_HEX[color], roughness: 0.3 });
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.visual.add(body);

    // A lip around the top, and a dark square inside it, so it reads as open.
    const lip = 0.06 * scale;
    this.rimGeo = roundedBox(this.width + lip, lip * 1.7, this.width + lip, 0.045);
    this.rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(COLOR_HEX[color]).lerp(new THREE.Color(0xffffff), 0.22), roughness: 0.25 });
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    rim.position.y = height;
    this.visual.add(rim);

    this.holeGeo = roundedBox(this.width * 0.76, this.width * 0.76, 0.025, 0.065);
    this.holeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOR_HEX[color]).multiplyScalar(0.35) });
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = height + lip * 0.86;
    this.visual.add(hole);

    const lidWidth = this.width + lip;
    const lidHeight = lip * 1.5;
    this.lidGeo = roundedBox(lidWidth, lidHeight, lidWidth, 0.035);
    this.lidMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLOR_HEX[color]).lerp(new THREE.Color(0xffffff), 0.12),
      roughness: 0.28,
    });
    const lid = new THREE.Mesh(this.lidGeo, this.lidMat);
    lid.name = 'container-lid';
    lid.position.z = lidWidth / 2;
    lid.castShadow = true;
    lid.receiveShadow = true;
    this.lidHinge.position.set(0, height + lip + lidHeight / 2, -lidWidth / 2);
    this.lidHinge.add(lid);
    this.visual.add(this.lidHinge);

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
    this.badgeTex.colorSpace = THREE.SRGBColorSpace;
    this.badgeMat = new THREE.MeshBasicMaterial({ map: this.badgeTex, transparent: true,
      depthWrite: false, alphaTest: 0.01, toneMapped: false });
    this.badgeGeo = new THREE.PlaneGeometry(1, 1);
    this.badge = new THREE.Mesh(this.badgeGeo, this.badgeMat);
    this.badge.name = 'container-counter';
    this.badge.scale.setScalar(this.badgeSize);
    this.badge.position.y = this.queueBadgeY;
    this.badge.renderOrder = 5;
    this.visual.add(this.badge);
    this.refreshBadge();
    if (this.hidden) this.tintMaterials(0);
  }

  /** The counter above the container: charges, or "?" while hidden. */
  refreshBadge() {
    const shown = this.hidden ? '?' : String(this.charges);
    if (this.badgeShown === shown) return;
    this.badgeShown = shown;
    const ctx = this.badgeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 96, 96);
    ctx.beginPath();
    ctx.arc(48, 48, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#fff7e8';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(113,72,43,0.14)';
    ctx.stroke();
    ctx.fillStyle = '#684b3d';
    ctx.font = 'bold 54px -apple-system, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shown, 48, 52);
    this.badgeTex.needsUpdate = true;
  }

  /** The reserved 3×3 cell, in world space. Recomputed in flight as layers settle. */
  landingPoint(index: number, visible: number, out: THREE.Vector3): THREE.Vector3 {
    this.cellPosition(index, visible, out);
    return this.group.localToWorld(out);
  }

  receiveCube(mesh: THREE.Mesh, cell: number, index: number) {
    this.group.attach(mesh);
    mesh.rotation.set(0, 0, 0);
    this.packingScale(cell, mesh.scale);
    this.cubes.push({ mesh, index, cell });
    this.highestLanded = Math.max(this.highestLanded, index);
    this.bounce(0.5);
  }

  /** Retain whole layers, so an older pixel never changes its row or column. */
  updateStack(dt: number, visible: number) {
    const k = 1 - Math.exp(-18 * dt);
    for (let i = this.cubes.length - 1; i >= 0; i--) {
      const { mesh, index, cell } = this.cubes[i];
      this.cellPosition(index, visible, this.packedPosition);
      mesh.position.lerp(this.packedPosition, k);
      this.packingScale(cell, this.packedScale);
      if (this.packedPosition.y < this.rimY) {
        mesh.scale.multiplyScalar(1 - k);
        if (mesh.scale.x < 0.025) {
          mesh.removeFromParent();
          this.cubes.splice(i, 1);
        }
      } else {
        mesh.scale.lerp(this.packedScale, k);
      }
    }

  }

  /** Walk toward the assigned target position. Returns true once it has arrived. */
  moveToward(dt: number, speed: number): boolean {
    if (this.state === 'walking' && this.travelDuration > 0) {
      this.travelT = Math.min(1, this.travelT + dt / this.travelDuration);
      const t = this.travelT;
      const ease = t * t * (3 - 2 * t);
      this.group.position.lerpVectors(this.travelFrom, this.target, ease);
      this.group.position.y += Math.sin(t * Math.PI) * 0.32;
      this.visual.rotation.x = Math.sin(t * Math.PI * 2) * 0.1;
      if (t >= 1) { this.visual.rotation.x = 0; this.bounce(1); return true; }
      return false;
    }
    const d = this.group.position.distanceTo(this.target);
    if (d < 0.004) {
      this.group.position.copy(this.target);
      return true;
    }
    const s = Math.min(speed * dt, d * (1 - Math.exp(-12 * dt)));
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
    const glow = on ? 0x12100a : 0x000000;
    this.bodyMat.emissive.setHex(glow);
    this.rimMat.emissive.setHex(glow);
    this.lidMat.emissive.setHex(glow);
  }

  dispose() {
    // Caught cubes are billboard meshes; their geometry and material are the board's.
    for (const { mesh } of this.cubes) mesh.removeFromParent();
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
    this.lidGeo.dispose();
    this.lidMat.dispose();
    this.badgeGeo.dispose();
    this.badgeTex.dispose();
    this.badgeMat.dispose();
  }
}
