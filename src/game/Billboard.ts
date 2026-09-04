import * as THREE from 'three';
import type { ColorKey, ShapeDef } from '../shared/types';
import { CHAR_TO_COLOR, COLOR_HEX } from '../shared/colors';
import type { Settings } from '../shared/settings';

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

  /** grid[col][row], row 0 = bottom. null where the shape has a hole. */
  readonly grid: (Tile | null)[][] = [];
  readonly tiles: Tile[] = [];

  aliveCount = 0;

  private swingZ = 0;
  private swingZv = 0;
  private swingX = 0;
  private swingXv = 0;
  private readonly phase: number;

  private readonly tileGeo: THREE.BoxGeometry;
  private readonly ropeGeo: THREE.CylinderGeometry;
  private readonly ropeMat: THREE.MeshStandardMaterial;
  private readonly barMat: THREE.MeshStandardMaterial;
  private readonly barGeo: THREE.BoxGeometry;
  private readonly mats = new Map<ColorKey, THREE.MeshStandardMaterial>();

  constructor(shape: ShapeDef, angle: number, s: Settings, index: number) {
    this.cols = shape.rows[0].length;
    this.rows = shape.rows.length;
    this.cell = s.cellSize;
    this.halfWidth = ((this.cols - 1) / 2) * this.cell;
    this.phase = index * 1.7;

    this.arm.rotation.y = angle;
    this.arm.add(this.pivot);
    this.pivot.position.set(0, s.ceilingHeight, s.carouselRadius);

    const boardHalfH = ((this.rows - 1) / 2) * this.cell;
    this.board.position.set(0, -(s.ropeLength + boardHalfH + this.cell * 0.6), 0);
    this.pivot.add(this.board);

    // Hanging bar across the top of the board + two ropes up to the ceiling.
    this.ropeGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 6);
    this.ropeMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9 });
    const ropeX = this.halfWidth * 0.8;
    for (const sx of [-1, 1]) {
      const rope = new THREE.Mesh(this.ropeGeo, this.ropeMat);
      rope.scale.y = s.ropeLength;
      rope.position.set(sx * ropeX, -s.ropeLength / 2, 0);
      this.pivot.add(rope);
    }
    this.barGeo = new THREE.BoxGeometry(this.halfWidth * 2 + this.cell * 1.2, this.cell * 0.45, this.cell * 0.9);
    this.barMat = new THREE.MeshStandardMaterial({ color: 0x6b5947, roughness: 0.85 });
    const bar = new THREE.Mesh(this.barGeo, this.barMat);
    bar.position.set(0, boardHalfH + this.cell * 0.85, 0);
    this.board.add(bar);

    // Tiles.
    this.tileGeo = new THREE.BoxGeometry(this.cell * 0.92, this.cell * 0.92, this.cell * 0.55);
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
        this.board.add(mesh);
        const tile: Tile = { col: c, row: r, color, mesh, alive: true, reserved: false, popT: -1, board: this };
        this.grid[c][r] = tile;
        this.tiles.push(tile);
        this.aliveCount++;
      }
    }
  }

  private material(c: ColorKey): THREE.MeshStandardMaterial {
    let m = this.mats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: COLOR_HEX[c], roughness: 0.55, metalness: 0.05 });
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
   * Put `worldPos` into this board's local space. Goes through the live world matrix,
   * so swing and carousel rotation are automatically included.
   */
  localize(worldPos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(worldPos);
    this.board.worldToLocal(out);
    return out;
  }

  /** Column index for a local-space x, or -1 if the point is off the board. */
  colFromLocalX(x: number): number {
    const col = Math.round(x / this.cell + (this.cols - 1) / 2);
    if (col < 0 || col >= this.cols) return -1;
    return col;
  }

  /**
   * Walking a column bottom-up: the run of consecutive same-color tiles starting at
   * the lowest tile still standing. Empty if that lowest tile is a different color.
   */
  columnRun(col: number, color: ColorKey): Tile[] {
    const column = this.grid[col];
    const run: Tile[] = [];
    for (let r = 0; r < this.rows; r++) {
      const t = column[r];
      if (!t || !t.alive || t.reserved) continue; // skip holes and doomed tiles
      if (t.color !== color) break;
      run.push(t);
    }
    return run;
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
    this.tileGeo.dispose();
    this.ropeGeo.dispose();
    this.ropeMat.dispose();
    this.barGeo.dispose();
    this.barMat.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
