import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import type { Billboard } from './Billboard';
import { roundedBox } from './visuals';

const FLIGHT_TIME = 0.7;

/**
 * A cube launched from a finished container to a frozen billboard of its color. It
 * cracks the ice where it lands, and takes `amount` containers off the board's counter:
 * 1 for a container's last cube, 0 for the others.
 */
export class ProgressShot {
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private t = 0;
  readonly impact: THREE.Vector3;

  constructor(
    private readonly world: THREE.Object3D,
    from: THREE.Vector3,
    readonly board: Billboard,
    color: ColorKey,
    readonly amount: number,
    /** This cube's share of its container, for how far the ice cracks. */
    readonly share: number,
    private delay: number,
    impactIndex = 0,
  ) {
    this.impact = board.frozenImpactPoint(world.localToWorld(from.clone()), impactIndex);
    this.mesh = new THREE.Mesh(
      roundedBox(0.17, 0.17, 0.17, 0.035),
      new THREE.MeshStandardMaterial({ color: COLOR_HEX[color], emissive: COLOR_HEX[color], emissiveIntensity: 0.35, roughness: 0.3 }),
    );
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.from.copy(from);
    world.add(this.mesh);
  }

  /** Returns true on the frame it reaches the board. */
  update(dt: number): boolean {
    if (this.delay > 0) {
      this.delay -= dt;
      return false;
    }
    this.mesh.visible = true;
    this.t = Math.min(1, this.t + dt / FLIGHT_TIME);
    // Follow the board: it may swing or turn while the cube is in the air.
    this.board.board.localToWorld(this.to.copy(this.impact));
    this.world.worldToLocal(this.to);
    this.ctrl.copy(this.from).lerp(this.to, 0.5);
    this.ctrl.y += 1.4;
    const t = this.t * this.t * (3 - 2 * this.t);
    const u = 1 - t;
    this.mesh.position.set(
      u * u * this.from.x + 2 * u * t * this.ctrl.x + t * t * this.to.x,
      u * u * this.from.y + 2 * u * t * this.ctrl.y + t * t * this.to.y,
      u * u * this.from.z + 2 * u * t * this.ctrl.z + t * t * this.to.z,
    );
    this.mesh.rotation.set(t * 5, t * 7, 0);
    this.mesh.scale.setScalar(0.6 + Math.sin(t * Math.PI) * 0.6);
    return this.t >= 1;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
