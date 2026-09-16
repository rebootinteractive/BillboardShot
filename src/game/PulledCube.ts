import * as THREE from 'three';
import type { Tile } from './Billboard';
import type { Shooter } from './Shooter';

const REST_ROTATION = new THREE.Quaternion();

/**
 * A billboard pixel on its way down into a container. It is the real tile mesh,
 * lifted out of the grid into world space, so the gap it leaves in the artwork is
 * the cube you watch travel.
 */
export class PulledCube {
  readonly tile: Tile;
  readonly container: Shooter;
  readonly stackIndex: number;
  private readonly packedScale = new THREE.Vector3();

  private t = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private readonly travel: number;
  private readonly spin: number;
  private readonly initialRotation = new THREE.Quaternion();

  constructor(
    world: THREE.Object3D,
    tile: Tile,
    container: Shooter,
    private readonly visibleCubes: number,
    private readonly speed: number,
    arc: number,
  ) {
    this.tile = tile;
    this.container = container;

    // Keep its world transform while leaving the swinging, rotating board.
    world.attach(tile.mesh);
    tile.mesh.scale.setScalar(1);
    this.from.copy(tile.mesh.position);
    this.initialRotation.copy(tile.mesh.quaternion);
    this.stackIndex = container.reserveCell();
    container.landingPoint(this.stackIndex, visibleCubes, this.to);
    container.packingScale(tile.board.cell, this.packedScale);

    this.ctrl.copy(this.from).add(this.to).multiplyScalar(0.5);
    // Lift scales with sideways reach, as shots did: straight down stays straight.
    this.ctrl.y += arc * Math.hypot(this.to.x - this.from.x, this.to.z - this.from.z);
    this.travel = Math.max(0.3, this.from.distanceTo(this.to));
    this.spin = (tile.col % 2 === 0 ? -1 : 1) * 0.65;
  }

  /** Returns true when it has reached the container. */
  update(dt: number): boolean {
    this.t = Math.min(1, this.t + (dt * this.speed) / this.travel);
    // A brief pull-away, followed by an accelerating magnetic catch.
    const t = this.t * this.t * (2 - this.t);
    const u = 1 - t;
    const m = this.tile.mesh;
    this.container.landingPoint(this.stackIndex, this.visibleCubes, this.to);
    m.position.set(
      u * u * this.from.x + 2 * u * t * this.ctrl.x + t * t * this.to.x,
      u * u * this.from.y + 2 * u * t * this.ctrl.y + t * t * this.to.y,
      u * u * this.from.z + 2 * u * t * this.ctrl.z + t * t * this.to.z,
    );
    m.quaternion.copy(this.initialRotation).slerp(REST_ROTATION, t);
    m.rotateZ(Math.sin(t * Math.PI) * this.spin);
    const stretch = Math.sin(t * Math.PI) * 0.16;
    m.scale.set(1 - stretch * 0.35, 1 + stretch, 1 - stretch * 0.35);
    m.scale.lerp(this.packedScale, t * t);
    return this.t >= 1;
  }
}
