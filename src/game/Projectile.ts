import * as THREE from 'three';
import type { Tile } from './Billboard';
import type { Shooter } from './Shooter';

/**
 * An arcing homing shot. The target tile keeps moving (the board swings and the
 * carousel turns), so the curve is re-evaluated against the tile's live world
 * position every frame.
 */
export class Projectile {
  readonly mesh: THREE.Mesh;
  readonly tile: Tile;
  readonly shooter: Shooter;

  private t = 0;
  private delay: number;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private readonly arc: number;
  private readonly speed: number;
  private readonly travel: number;

  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    from: THREE.Vector3,
    tile: Tile,
    shooter: Shooter,
    speed: number,
    arc: number,
    delay: number,
  ) {
    this.mesh = new THREE.Mesh(geo, mat);
    this.tile = tile;
    this.shooter = shooter;
    this.from.copy(from);
    this.speed = speed;
    this.arc = arc;
    this.delay = delay;
    tile.mesh.getWorldPosition(this.to);
    this.travel = Math.max(0.5, this.from.distanceTo(this.to));
    this.mesh.position.copy(from);
    this.mesh.visible = delay <= 0;
  }

  /** Returns true when it has landed. */
  update(dt: number): boolean {
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return false;
      this.mesh.visible = true;
    }
    this.t = Math.min(1, this.t + (dt * this.speed) / this.travel);
    this.tile.mesh.getWorldPosition(this.to);
    this.ctrl.copy(this.from).add(this.to).multiplyScalar(0.5);
    this.ctrl.y += this.arc;

    const u = 1 - this.t;
    this.mesh.position.set(
      u * u * this.from.x + 2 * u * this.t * this.ctrl.x + this.t * this.t * this.to.x,
      u * u * this.from.y + 2 * u * this.t * this.ctrl.y + this.t * this.t * this.to.y,
      u * u * this.from.z + 2 * u * this.t * this.ctrl.z + this.t * this.t * this.to.z,
    );
    return this.t >= 1;
  }
}
