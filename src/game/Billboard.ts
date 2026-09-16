import * as THREE from 'three';
import { roundedBox, beveledBorder } from './visuals';
import type { ColorKey, ShapeDef } from '../shared/types';
import { CHAR_TO_COLOR, COLOR_HEX } from '../shared/colors';
import type { Settings } from '../shared/settings';

const DISTANT_TINT = new THREE.Color(0xd2d6da);

/** A single shootable pixel: the lowest one still standing in its column. */
export interface EligibleTarget {
  board: Billboard;
  tile: Tile;
  color: ColorKey;
  /** World angle around the carousel axis, filled in by the caller. */
  angle: number;
}

export interface Tile {
  col: number;
  row: number;
  color: ColorKey;
  mesh: THREE.Mesh;
  alive: boolean;
  /** Claimed by an in-flight projectile — treated as already gone by targeting. */
  reserved: boolean;
  /** >= 0 while playing the pop-out animation. */
  popT: number;
  board: Billboard;
}

/**
 * One pixel-art billboard hanging from the ceiling ring on two ropes.
 *
 * Hierarchy:
 *   arm   (rotation.y = ring angle)
 *     pivot  (at ceiling height, radius out; rotates = the swing)
 *       ropes
 *       board  (holds the tiles; this is the space we map shooters into)
 */
export class Billboard {
  readonly arm = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly board = new THREE.Group();

  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly halfWidth: number;
  /** Actual and destination angles may differ while the ring closes a gap. */
  get angle() { return this.arm.rotation.y; }
  targetAngle: number;
  frameState: 'hanging' | 'falling' | 'gone' = 'hanging';
  private layoutFrom = 0;
  private layoutT = 1;
  private dropT = 0;
  private readonly dropFrom = new THREE.Vector3();
  private readonly dropRotation = new THREE.Quaternion();
  /** Bottom edge of the pixel grid, relative to the ceiling pivot (negative). */
  readonly bottomOffset: number;

  /** grid[col][row], row 0 = bottom. null where the shape has a hole. */
  readonly grid: (Tile | null)[][] = [];
  readonly tiles: Tile[] = [];

  aliveCount = 0;

  private swingZ = 0;
  private swingZv = 0;
  private swingX = 0;
  private swingXv = 0;
  private readonly phase: number;
  private focus = 0;

  setFocus(on: boolean, dt: number) {
    this.focus += ((on ? 1 : 0) - this.focus) * (1 - Math.exp(-8 * dt));
    for (const tile of this.tiles) tile.mesh.castShadow = on;
    for (const [color, material] of this.mats) {
      material.color.setHex(COLOR_HEX[color]).lerp(DISTANT_TINT, (1 - this.focus) * 0.12);
    }
  }

  private readonly tileGeo: THREE.BufferGeometry;
  private readonly ropeGeo: THREE.CylinderGeometry;
  private readonly ropeMat: THREE.MeshStandardMaterial;
  private readonly barMat: THREE.MeshStandardMaterial;
  private readonly barGeo: THREE.BufferGeometry;
  private readonly outlineGeo: THREE.BufferGeometry;
  private readonly outlineMat: THREE.MeshStandardMaterial;
  private readonly mats = new Map<ColorKey, THREE.MeshStandardMaterial>();

  constructor(shape: ShapeDef, angle: number, s: Settings, index: number) {
    this.cols = shape.rows[0].length;
    this.rows = shape.rows.length;
    this.cell = s.cellSize;
    this.halfWidth = ((this.cols - 1) / 2) * this.cell;
    this.phase = index * 1.7;

    this.targetAngle = angle;
    this.layoutFrom = angle;
    this.arm.rotation.y = angle;
    this.arm.add(this.pivot);
    this.pivot.position.set(0, s.ceilingHeight, s.carouselRadius);

    const boardHalfH = ((this.rows - 1) / 2) * this.cell;
    this.board.position.set(0, -(s.ropeLength + boardHalfH + this.cell * 0.6), 0);
    this.pivot.add(this.board);
    this.bottomOffset = this.board.position.y - boardHalfH - this.cell / 2;

    // Hanging bar across the top of the board + two ropes up to the ceiling.
    this.ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
    this.ropeMat = new THREE.MeshStandardMaterial({ color: 0xd1a87a, roughness: 0.9 });
    const ropeX = this.halfWidth * 0.8;
    for (const sx of [-1, 1]) {
      const rope = new THREE.Mesh(this.ropeGeo, this.ropeMat);
      rope.scale.y = s.ropeLength;
      rope.position.set(sx * ropeX, -s.ropeLength / 2, 0);
      this.pivot.add(rope);
    }
    // The bar the ropes tie to, sitting above the artwork.
    this.barGeo = roundedBox(this.halfWidth * 2 + this.cell * 1.2, this.cell * 0.4, this.cell * 0.9);
    this.barMat = new THREE.MeshStandardMaterial({ color: 0xffedce, roughness: 0.8 });
    const bar = new THREE.Mesh(this.barGeo, this.barMat);
    bar.position.set(0, boardHalfH + this.cell * 0.9, 0);
    this.board.add(bar);

    // Tiles.
    this.tileGeo = roundedBox(this.cell * 0.94, this.cell * 0.94, this.cell * 0.7, this.cell * 0.12);
    for (let c = 0; c < this.cols; c++) this.grid.push(new Array(this.rows).fill(null));

    for (let r = 0; r < this.rows; r++) {
      const srcRow = shape.rows[this.rows - 1 - r]; // row 0 = bottom
      for (let c = 0; c < this.cols; c++) {
        const ch = srcRow[c];
        const color = CHAR_TO_COLOR[ch];
        if (!color) continue;
        const mesh = new THREE.Mesh(this.tileGeo, this.material(color));
        mesh.position.set(
          (c - (this.cols - 1) / 2) * this.cell,
          (r - (this.rows - 1) / 2) * this.cell,
          0,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.board.add(mesh);
        const tile: Tile = { col: c, row: r, color, mesh, alive: true, reserved: false, popT: -1, board: this };
        this.grid[c][r] = tile;
        this.tiles.push(tile);
        this.aliveCount++;
      }
    }

    this.outlineMat = new THREE.MeshStandardMaterial({ color: 0xffedce, roughness: 0.4 });
    this.outlineGeo = this.buildOutline();
    const border = new THREE.Mesh(this.outlineGeo, this.outlineMat);
    border.name = 'billboard-border';
    this.board.add(border);
  }

  moveToAngle(angle: number) {
    this.layoutFrom = this.angle;
    this.targetAngle = this.angle + Math.atan2(Math.sin(angle - this.angle), Math.cos(angle - this.angle));
    this.layoutT = 0;
  }

  /** Detach the empty hanging assembly, so swiping cannot drag a falling frame. */
  dropFrame(world: THREE.Object3D) {
    if (this.frameState !== 'hanging') return;
    this.frameState = 'falling';
    world.attach(this.pivot);
    this.dropFrom.copy(this.pivot.position);
    this.dropRotation.copy(this.pivot.quaternion);
    this.arm.visible = false;
    for (const mat of [this.ropeMat, this.barMat, this.outlineMat]) {
      mat.transparent = true;
      mat.depthWrite = false;
    }
  }

  /** One uninterrupted top-and-side border. Preserve the open bottom through
   * which pixels leave, stopping the sides where the silhouette starts tapering. */
  private buildOutline(): THREE.BufferGeometry {
    const span = (row: number): [number, number] | null => {
      const columns = this.grid.flatMap((column, c) => column[row] ? [c] : []);
      return columns.length ? [columns[0], columns[columns.length - 1]] : null;
    };
    const top = this.rows - 1;
    const first = span(top);
    if (!first) return new THREE.BufferGeometry();
    let [left, right] = first;
    let bottom = top;
    for (let row = top - 1; row >= 0; row--) {
      const current = span(row);
      if (!current || current[0] > left || current[1] < right) break;
      [left, right] = current;
      bottom = row;
    }
    const point = (col: number, row: number) => new THREE.Vector2(
      (col - this.cols / 2) * this.cell,
      (row - this.rows / 2) * this.cell,
    );
    const edge: THREE.Vector2[] = [point(left, bottom)];
    for (let col = left; col <= right; col++) {
      let ceiling = top;
      while (ceiling > bottom && !this.grid[col][ceiling]) ceiling--;
      edge.push(point(col, ceiling + 1), point(col + 1, ceiling + 1));
    }
    edge.push(point(right + 1, bottom));
    // Adjacent columns at the same height share an endpoint.
    const unique = edge.filter((p, i) => i === 0 || !p.equals(edge[i - 1]));
    return beveledBorder(unique, this.cell * 0.34, this.cell * 0.75, this.cell * 0.24);
  }

  private material(c: ColorKey): THREE.MeshStandardMaterial {
    let m = this.mats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: COLOR_HEX[c], roughness: 0.32, metalness: 0 });
      this.mats.set(c, m);
    }
    return m;
  }

  /** Counts of tiles still worth shooting, keyed by color. */
  addRemainingCounts(into: Map<ColorKey, number>) {
    for (const t of this.tiles) {
      if (!t.alive || t.reserved) continue;
      into.set(t.color, (into.get(t.color) ?? 0) + 1);
    }
  }

  /**
   * Colors sitting at the bottom of a column — the only tiles anything can hit.
   * The carousel eventually brings every column over every deck slot, so a color
   * that is nowhere at the bottom of a column is unreachable, not just misaligned.
   */
  addFirableColors(into: Set<ColorKey>) {
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const t = this.grid[c][r];
        if (!t || !t.alive || t.reserved) continue;
        into.add(t.color);
        break;
      }
    }
  }

  /**
   * The lowest tile still standing in this column — the only shootable one, since
   * the outline is open at the bottom and a pixel needs a clear path down to be hit.
   */
  lowestStanding(col: number): Tile | null {
    const column = this.grid[col];
    for (let r = 0; r < this.rows; r++) {
      const t = column[r];
      if (!t || !t.alive || t.reserved) continue; // holes and doomed tiles are empty
      return t;
    }
    return null;
  }

  /** One entry per column that currently has something shootable at its bottom. */
  collectEligible(out: EligibleTarget[]) {
    for (let c = 0; c < this.cols; c++) {
      const tile = this.lowestStanding(c);
      if (!tile) continue;
      out.push({ board: this, tile, color: tile.color, angle: 0 });
    }
  }

  /**
   * The tile has been pulled out of the grid into a container. Unlike destroyTile
   * there is no pop — the mesh left the board and lives on in the container.
   */
  releaseTile(t: Tile) {
    if (!t.alive) return;
    t.alive = false;
    t.popT = -1;
    this.aliveCount--;
  }

  destroyTile(t: Tile) {
    if (!t.alive) return;
    t.alive = false;
    t.popT = 0;
    this.aliveCount--;
  }

  /** Kick from a projectile landing at local x offset `hitX`. */
  impulse(hitX: number, s: Settings) {
    const dir = hitX >= 0 ? 1 : -1;
    this.swingZv -= dir * s.swingImpulse;
    this.swingXv -= s.swingImpulse * 0.55;
  }

  update(dt: number, time: number, s: Settings) {
    if (this.frameState === 'gone') return;
    if (this.frameState === 'falling') {
      this.dropT = Math.min(1, this.dropT + dt / 0.8);
      const t = this.dropT;
      this.pivot.position.copy(this.dropFrom);
      this.pivot.position.y += Math.sin(t * Math.PI) * 0.08 - 6 * t * t;
      this.pivot.quaternion.copy(this.dropRotation);
      this.pivot.rotateX(-t * 0.3);
      this.pivot.rotateZ(Math.sin(this.phase + 1) * t * 0.25);
      const fade = 1 - THREE.MathUtils.smoothstep(t, 0.3, 1);
      for (const mat of [this.ropeMat, this.barMat, this.outlineMat]) mat.opacity = fade;
      if (t >= 1) {
        this.frameState = 'gone';
        this.pivot.removeFromParent();
      }
      return;
    }
    this.layoutT = Math.min(1, this.layoutT + dt / 0.65);
    const eased = this.layoutT * this.layoutT * (3 - 2 * this.layoutT);
    this.arm.rotation.y = THREE.MathUtils.lerp(this.layoutFrom, this.targetAngle, eased);
    // Damped harmonic swing about the ceiling pivot, plus a slow ambient sway.
    const sway = s.ambientSway * 0.02;
    this.swingZv += (-s.swingStiffness * this.swingZ - s.swingDamping * this.swingZv) * dt;
    this.swingZv += Math.sin(time * 0.9 + this.phase) * sway;
    this.swingZ += this.swingZv * dt;

    this.swingXv += (-s.swingStiffness * this.swingX - s.swingDamping * this.swingXv) * dt;
    this.swingXv += Math.sin(time * 0.63 + this.phase * 1.4) * sway * 0.6;
    this.swingX += this.swingXv * dt;

    this.pivot.rotation.z = this.swingZ;
    this.pivot.rotation.x = this.swingX;

    // Pop animation for destroyed tiles.
    for (const t of this.tiles) {
      if (t.popT < 0) continue;
      t.popT += dt / 0.16;
      if (t.popT >= 1) {
        t.popT = -1;
        t.mesh.visible = false;
        t.mesh.scale.setScalar(1);
      } else {
        const k = 1 - t.popT;
        t.mesh.scale.setScalar(k * (1 + t.popT * 0.9));
        t.mesh.rotation.z = t.popT * 2.2;
      }
    }
  }

  dispose() {
    this.arm.parent?.remove(this.arm);
    this.pivot.removeFromParent();
    this.tileGeo.dispose();
    this.ropeGeo.dispose();
    this.ropeMat.dispose();
    this.barGeo.dispose();
    this.barMat.dispose();
    this.outlineGeo.dispose();
    this.outlineMat.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
