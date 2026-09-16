import * as THREE from 'three';
import type { Tile } from './Billboard';
import type { Shooter } from './Shooter';

/**
 * A billboard pixel on its way down into a container. It is the real tile mesh,
 * lifted out of the grid into world space, so the gap it leaves in the artwork is
 * the cube you watch travel.
 */
export class PulledCube {
  readonly tile: Tile;
  readonly container: Shooter;

  private t = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private readonly travel: number;
  private readonly spin: number;

  constructor(
    world: THREE.Object3D,
    tile: Tile,
    container: Shooter,
    visibleCubes: number,
    private readonly speed: number,
    arc: number,
  ) {
    this.tile = tile;
    this.container = container;

    // Keep its world transform while leaving the swinging, rotating board.
    world.attach(tile.mesh);
    tile.mesh.scale.setScalar(1);
    this.from.copy(tile.mesh.position);
    container.landingPoint(visibleCubes, this.to);

    this.ctrl.copy(this.from).add(this.to).multiplyScalar(0.5);
    // Lift scales with sideways reach, as shots did: straight down stays straight.
    this.ctrl.y += arc * Math.hypot(this.to.x - this.from.x, this.to.z - this.from.z);
    this.travel = Math.max(0.3, this.from.distanceTo(this.to));
    this.spin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
  }

  /** Returns true when it has reached the container. */
  update(dt: number): boolean {
    this.t = Math.min(1, this.t + (dt * this.speed) / this.travel);
    const u = 1 - this.t;
    const m = this.tile.mesh;
    m.position.set(
      u * u * this.from.x + 2 * u * this.t * this.ctrl.x + this.t * this.t * this.to.x,
      u * u * this.from.y + 2 * u * this.t * this.ctrl.y + this.t * this.t * this.to.y,
      u * u * this.from.z + 2 * u * this.t * this.ctrl.z + this.t * this.t * this.to.z,
    );
    m.rotation.z += this.spin * dt;
    return this.t >= 1;
  }
}
