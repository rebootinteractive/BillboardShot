import * as THREE from 'three';
import type { ColorKey, ShapeDef } from '../shared/types';
import { CHAR_TO_COLOR, COLOR_HEX } from '../shared/colors';
import type { Settings } from '../shared/settings';

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
  private readonly outlineHGeo: THREE.BoxGeometry;
  private readonly outlineVGeo: THREE.BoxGeometry;
  private readonly outlineMat: THREE.MeshStandardMaterial;
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
    // The bar the ropes tie to, sitting above the artwork.
    this.barGeo = new THREE.BoxGeometry(this.halfWidth * 2 + this.cell * 1.2, this.cell * 0.4, this.cell * 0.9);
    this.barMat = new THREE.MeshStandardMaterial({ color: 0x7a6553, roughness: 0.8 });
    const bar = new THREE.Mesh(this.barGeo, this.barMat);
    bar.position.set(0, boardHalfH + this.cell * 0.9, 0);
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

    const ot = this.cell * 0.34;
    const od = this.cell * 1.05;
    this.outlineHGeo = new THREE.BoxGeometry(this.cell + ot, ot, od);
    this.outlineVGeo = new THREE.BoxGeometry(ot, this.cell + ot, od);
    this.outlineMat = new THREE.MeshStandardMaterial({ color: 0x7a6553, roughness: 0.8 });
    this.buildOutline(ot);
  }

  /**
   * Outline hugging the artwork's own silhouette — top and side edges only, since
   * the bottom is open. It is traced downward from the top row and stops at the
   * first row narrower than everything above it: the sides may widen as they
   * descend but never pull back in. On the heart that ends the sides after its
   * fourth row, where the lobes give way to the taper.
   */
  private buildOutline(ot: number) {
    const filled = (c: number, r: number) => c >= 0 && c < this.cols && r >= 0 && r < this.rows && !!this.grid[c][r];

    const span = (r: number): [number, number] | null => {
      let lo = -1;
      let hi = -1;
      for (let c = 0; c < this.cols; c++) {
        if (!filled(c, r)) continue;
        if (lo < 0) lo = c;
        hi = c;
      }
      return lo < 0 ? null : [lo, hi];
    };

    // Walk down from the top while each row is at least as wide as all above it.
    const top = this.rows - 1;
    let cutoff = top;
    const first = span(top);
    if (!first) return;
    let [L, R] = first;
    for (let r = top - 1; r >= 0; r--) {
      const sp = span(r);
      if (!sp || sp[0] > L || sp[1] < R) break;
      L = sp[0];
      R = sp[1];
      cutoff = r;
    }

    const xOf = (c: number) => (c - (this.cols - 1) / 2) * this.cell;
    const yOf = (r: number) => (r - (this.rows - 1) / 2) * this.cell;
    const add = (geo: THREE.BoxGeometry, x: number, y: number) => {
      const m = new THREE.Mesh(geo, this.outlineMat);
      m.position.set(x, y, 0);
      this.board.add(m);
    };

    /** Empty from this row all the way down — a gap that opens out of the bottom. */
    const opensDownward = (c: number, r: number) => {
      for (let k = r; k >= 0; k--) if (filled(c, k)) return false;
      return true;
    };

    // A gap inside a row that drains out of the bottom gets no side edges, so the
    // ghost's feet don't sprout teeth. A gap that is closed below — the notch
    // between the heart's lobes — is still traced.
    const skipSide = (nc: number, r: number, sp: [number, number]) =>
      nc > sp[0] && nc < sp[1] && opensDownward(nc, r);

    for (let r = cutoff; r <= top; r++) {
      const sp = span(r);
      if (!sp) continue;
      for (let c = 0; c < this.cols; c++) {
        if (!filled(c, r)) continue;
        if (!filled(c, r + 1)) add(this.outlineHGeo, xOf(c), yOf(r) + this.cell / 2 + ot / 2);
        if (!filled(c - 1, r) && !skipSide(c - 1, r, sp)) {
          add(this.outlineVGeo, xOf(c) - this.cell / 2 - ot / 2, yOf(r));
        }
        if (!filled(c + 1, r) && !skipSide(c + 1, r, sp)) {
          add(this.outlineVGeo, xOf(c) + this.cell / 2 + ot / 2, yOf(r));
        }
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
    this.outlineHGeo.dispose();
    this.outlineVGeo.dispose();
    this.outlineMat.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
