import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox, beveledBorder } from './visuals';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import type { FrameStyle, Settings } from '../shared/settings';
import { KEY_HEIGHT, KEY_WIDTH, artColor, isMysteryChar, type BoardData } from './level';
import { disposeObject, keyObject, mysteryTexture, type KeyColor } from './keys';
import { BoardPadlock } from './BoardPadlock';
import { BoardIce } from './BoardIce';
import { floodGroup } from '../rules/core';

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
  /** Mystery pixel whose color group has not been revealed yet. */
  hidden: boolean;
  /** Seconds until a revealed mystery pixel shows its color; < 0 when nothing is pending. */
  revealDelay: number;
  /** 0→1 while the reveal pop plays. */
  revealT: number;
}

/**
 * A key on the board: KEY_WIDTH × KEY_HEIGHT cells with no pixels, blocking its columns.
 * It is released once nothing stands beneath it.
 */
export interface BoardKey {
  /** Left column and bottom row, row 0 = bottom. */
  col: number;
  row: number;
  color: KeyColor;
  /** Belongs to the board until the key is released, then to its flight. */
  object: THREE.Object3D;
}


export type BoardLock =
  | { type: 'key'; color: KeyColor }
  /** `remaining` counts containers still to finish. */
  | { type: 'frozen'; color: ColorKey; remaining: number };

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

  /** While set, nothing can be pulled from this board. */
  lock: BoardLock | null = null;
  /** Containers delivered to the ice so far, counting part of one while its cubes land. */
  private frozenCubes = 0;
  /** Where a flying key heads for: the padlock, or the middle of the board. */
  readonly lockAnchor = new THREE.Object3D();
  private padlock: BoardPadlock | null = null;
  private ice: BoardIce | null = null;
  private frameMounts: THREE.Vector2[] = [];
  private readonly mysteryTex = mysteryTexture();
  private readonly mysteryMat = new THREE.MeshStandardMaterial({ map: this.mysteryTex, roughness: 0.4 });
  /** Keys still on the board. */
  keys: BoardKey[] = [];

  get locked() { return this.lock !== null; }

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
    this.mysteryMat.color.setHex(0xffffff).lerp(DISTANT_TINT, (1 - this.focus) * 0.12);
  }

  private readonly tileGeo: THREE.BufferGeometry;
  private readonly ropeGeo: THREE.CylinderGeometry;
  private readonly ropeMat: THREE.MeshStandardMaterial;
  private readonly barMat: THREE.MeshStandardMaterial;
  private readonly barGeo: THREE.BufferGeometry;
  private readonly border: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly outlineMat: THREE.MeshStandardMaterial;
  private readonly mats = new Map<ColorKey, THREE.MeshStandardMaterial>();

  constructor(data: BoardData, angle: number, s: Settings, index: number, cellSize = s.cellSize, frame: FrameStyle = 'full') {
    const art = data.art;
    this.cols = art[0].length;
    this.rows = art.length;
    this.cell = cellSize;
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
    // Keys are written with their top-left cell and rows from the top, like the art.
    for (const k of data.keys ?? []) {
      const key: BoardKey = { col: k.col, row: this.rows - k.row - KEY_HEIGHT, color: k.color, object: keyObject(k.color, this.cell) };
      key.object.position.set(
        (key.col + (KEY_WIDTH - 1) / 2 - (this.cols - 1) / 2) * this.cell,
        (key.row + (KEY_HEIGHT - 1) / 2 - (this.rows - 1) / 2) * this.cell,
        0,
      );
      this.board.add(key.object);
      this.keys.push(key);
    }

    for (let r = 0; r < this.rows; r++) {
      const srcRow = art[this.rows - 1 - r]; // row 0 = bottom
      for (let c = 0; c < this.cols; c++) {
        const ch = srcRow[c];
        const color = artColor(ch);
        if (!color) continue;
        const hidden = isMysteryChar(ch);
        const mesh = new THREE.Mesh(this.tileGeo, hidden ? this.mysteryMat : this.material(color));
        mesh.position.set(
          (c - (this.cols - 1) / 2) * this.cell,
          (r - (this.rows - 1) / 2) * this.cell,
          0,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.board.add(mesh);
        const tile: Tile = {
          col: c, row: r, color, mesh, alive: true, reserved: false, popT: -1, board: this,
          hidden, revealDelay: -1, revealT: 1,
        };
        this.grid[c][r] = tile;
        this.tiles.push(tile);
        this.aliveCount++;
      }
    }

    this.outlineMat = new THREE.MeshStandardMaterial({ color: 0xffedce, roughness: 0.4 });
    this.findFrameMounts();
    this.border = new THREE.Mesh(this.buildOutline(frame), this.outlineMat);
    this.border.name = 'billboard-border';
    this.board.add(this.border);

    this.board.add(this.lockAnchor);
    this.lockAnchor.position.z = this.cell * 0.9;
    if (data.lock?.type === 'key') {
      this.lock = { type: 'key', color: data.lock.color };
      this.buildPadlock(data.lock.color);
    } else if (data.lock?.type === 'frozen') {
      this.lock = { type: 'frozen', color: data.lock.color, remaining: data.lock.containers };
      this.buildIce();
    }
  }

  /** The key still covering a cell, if any. */
  private keyAt(col: number, row: number): BoardKey | undefined {
    return this.keys.find((k) => col >= k.col && col < k.col + KEY_WIDTH && row >= k.row && row < k.row + KEY_HEIGHT);
  }

  /**
   * Take off the board every key with nothing left beneath it in any of its columns.
   * A locked or frozen board holds on to its keys until it opens. The caller sends each
   * key's object on its way.
   */
  releaseFreeKeys(): BoardKey[] {
    if (this.locked || this.frameState !== 'hanging' || !this.keys.length) return [];
    const free = this.keys.filter((k) => {
      // A key beneath this one, in any shared column, goes first.
      if (this.keys.some((o) => o.row < k.row && o.col < k.col + KEY_WIDTH && o.col + KEY_WIDTH > k.col)) return false;
      for (let c = k.col; c < k.col + KEY_WIDTH; c++) {
        for (let r = 0; r < k.row; r++) {
          const t = this.grid[c][r];
          if (t && t.alive && !t.reserved) return false;
        }
      }
      return true;
    });
    this.keys = this.keys.filter((k) => !free.includes(k));
    return free;
  }

  /** Soft molded hardware, attached to the silhouette's cream frame. */
  private buildPadlock(color: KeyColor) {
    this.padlock = new BoardPadlock(color, this.cell, this.frameMounts, this.rows * this.cell);
    this.lockAnchor.position.copy(this.padlock.socket.position);
    this.board.add(this.padlock.group);
  }

  keyApproaching(progress: number) { this.padlock?.keyApproaching(progress); }
  get lockVisualPhase() { return this.padlock?.phase ?? this.ice?.phase ?? null; }

  /** A beveled shell following the actual occupied cells, including rear faces. */
  private buildIce() {
    if (this.lock?.type !== 'frozen') return;
    const cells: THREE.Vector2[] = [];
    for (let col = 0; col < this.cols; col++) for (let row = 0; row < this.rows; row++) {
      if (this.grid[col][row] || this.keyAt(col, row)) cells.push(new THREE.Vector2(col, row));
    }
    this.ice = new BoardIce(this.cell, this.cols, this.rows, cells, this.lock.color, this.lock.remaining);
    this.lockAnchor.position.set(0, 0, this.cell * 1.02);
    this.board.add(this.ice.group);
  }

  /** Pick an occupied ice surface on the side facing the launching container. */
  frozenImpactPoint(sourceWorld: THREE.Vector3, index: number) {
    const source = this.board.worldToLocal(sourceWorld.clone());
    return this.ice?.impactPoint(source, index) ?? this.lockAnchor.position.clone();
  }

  /**
   * A hit from a finished container of the frozen color: `amount` is how many containers
   * it counts for (a container's last cube carries 1, the rest 0). Returns true if this
   * thawed the board.
   */
  addFrozenProgress(amount: number, share: number, impact = this.lockAnchor.position): boolean {
    if (this.lock?.type !== 'frozen') return false;
    this.lock.remaining = Math.max(0, this.lock.remaining - amount);
    this.frozenCubes += share;
    this.ice?.hit(this.lock.remaining, impact, this.frozenCubes);
    if (this.lock.remaining > 0) return false;
    this.unlock();
    return true;
  }

  /** Release gameplay immediately while the hardware or ice finishes breaking. */
  unlock() {
    if (!this.lock) return;
    this.lock = null;
    this.padlock?.unlock();
    this.ice?.shatter();
  }

  /**
   * Reveal any mystery pixel that has become the lowest standing one in its column,
   * flooding through its connected same-color group.
   */
  revealExposed() {
    for (let c = 0; c < this.cols; c++) {
      const tile = this.lowestStanding(c);
      if (tile?.hidden) this.revealGroup(tile);
    }
  }

  private revealGroup(start: Tile) {
    const group = floodGroup(start, (tile) => [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dc, dr]) => {
      const next = this.grid[tile.col + dc]?.[tile.row + dr];
      // Pixels still in flight count as present; collected ones do not connect.
      return next && next.alive && next.color === start.color ? [next] : [];
    }));
    for (const { cell, distance } of group) {
      if (!cell.hidden) continue;
      cell.hidden = false;
      cell.revealDelay = distance * 0.045;
    }
  }

  /** Show a revealed pixel's color straight away, e.g. as it is pulled. */
  showTrueColor(tile: Tile) {
    if (tile.revealDelay < 0) return;
    tile.revealDelay = -1;
    tile.mesh.material = this.material(tile.color);
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

  /** Per row, the leftmost and rightmost occupied column (pixel or key), row 0 = bottom. */
  private rowSpans(): Array<[number, number] | null> {
    const filled = (col: number, row: number) => !!this.grid[col][row] || !!this.keyAt(col, row);
    return Array.from({ length: this.rows }, (_, row): [number, number] | null => {
      const columns = this.grid.flatMap((_, col) => filled(col, row) ? [col] : []);
      return columns.length ? [columns[0], columns[columns.length - 1]] : null;
    });
  }

  private framePoint(col: number, row: number) {
    return new THREE.Vector2((col - this.cols / 2) * this.cell, (row - this.rows / 2) * this.cell);
  }

  /** Where padlock chains attach: the real side edges, a little above the padlock, the
   * same for every frame style. */
  private findFrameMounts() {
    const spans = this.rowSpans();
    const occupiedRows = spans.flatMap((span, row) => span ? [row] : []);
    if (!occupiedRows.length) return;
    const mountRow = occupiedRows.reduce((best, row) =>
      Math.abs(row - this.rows * 0.6) < Math.abs(best - this.rows * 0.6) ? row : best);
    const [mountLeft, mountRight] = spans[mountRow]!;
    this.frameMounts = [this.framePoint(mountLeft - 0.12, mountRow + 0.5), this.framePoint(mountRight + 1.12, mountRow + 0.5)];
  }

  /**
   * The border around the art, always open at the bottom for pixels to leave.
   * - `full` follows both outer side edges through every widening and narrowing; empty
   *   rows separate independent outlines.
   * - `half` runs over the top and down the sides only as far as the silhouette keeps
   *   widening, stopping where it starts to taper.
   * - `off` has no border.
   */
  private buildOutline(style: FrameStyle): THREE.BufferGeometry {
    if (style === 'off') return new THREE.BufferGeometry();
    const filled = (col: number, row: number) => !!this.grid[col][row] || !!this.keyAt(col, row);
    const spans = this.rowSpans();
    const point = (col: number, row: number) => this.framePoint(col, row);
    const border = (edge: THREE.Vector2[]) => {
      // Adjacent columns at the same height share an endpoint.
      const unique = edge.filter((p, i) => i === 0 || !p.equals(edge[i - 1]));
      return beveledBorder(unique, this.cell * 0.34, this.cell * 0.75, this.cell * 0.24);
    };

    if (style === 'half') {
      const top = this.rows - 1;
      const first = spans[top];
      if (!first) return new THREE.BufferGeometry();
      let [left, right] = first;
      let bottom = top;
      for (let row = top - 1; row >= 0; row--) {
        const current = spans[row];
        if (!current || current[0] > left || current[1] < right) break;
        [left, right] = current;
        bottom = row;
      }
      const edge: THREE.Vector2[] = [point(left, bottom)];
      for (let col = left; col <= right; col++) {
        let ceiling = top;
        while (ceiling > bottom && !filled(col, ceiling)) ceiling--;
        edge.push(point(col, ceiling + 1), point(col + 1, ceiling + 1));
      }
      edge.push(point(right + 1, bottom));
      return border(edge);
    }

    const geometries: THREE.BufferGeometry[] = [];
    for (let bottom = 0; bottom < this.rows; bottom++) {
      if (!spans[bottom]) continue;
      let top = bottom;
      while (top + 1 < this.rows && spans[top + 1]) top++;
      const edge: THREE.Vector2[] = [];
      // Ascend the complete left edge, including the undersides of wider rows.
      for (let row = bottom; row <= top; row++) {
        edge.push(point(spans[row]![0], row), point(spans[row]![0], row + 1));
      }
      // Preserve notches in the upper silhouette (for example a heart's lobes).
      const [left, right] = spans[top]!;
      for (let col = left; col <= right; col++) {
        let ceiling = top;
        while (ceiling > bottom && !filled(col, ceiling)) ceiling--;
        edge.push(point(col, ceiling + 1), point(col + 1, ceiling + 1));
      }
      // Descend the complete right edge to the final occupied row.
      for (let row = top; row >= bottom; row--) {
        edge.push(point(spans[row]![1] + 1, row + 1), point(spans[row]![1] + 1, row));
      }
      geometries.push(border(edge));
      bottom = top;
    }
    if (!geometries.length) return new THREE.BufferGeometry();
    if (geometries.length === 1) return geometries[0];
    const merged = mergeGeometries(geometries)!;
    geometries.forEach(geometry => geometry.dispose());
    return merged;
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
    if (this.locked) return;
    for (let c = 0; c < this.cols; c++) {
      const t = this.lowestStanding(c);
      if (t) into.add(t.color);
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
      if (!t || !t.alive || t.reserved) {
        // Holes and doomed tiles are empty; a key blocks everything above it.
        if (!t && this.keyAt(col, r)) return null;
        continue;
      }
      return t;
    }
    return null;
  }

  /** One entry per column that currently has something shootable at its bottom. */
  collectEligible(out: EligibleTarget[]) {
    if (this.locked) return;
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
    if (this.ice?.update(dt, time)) {
      this.ice.dispose();
      this.ice = null;
    }
    if (this.padlock?.update(dt, time)) {
      this.padlock.dispose();
      this.padlock = null;
    }
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

    // Mystery pixels flipping to their color, one ring of the flood at a time.
    for (const t of this.tiles) {
      if (t.revealDelay >= 0) {
        t.revealDelay -= dt;
        if (t.revealDelay < 0) {
          t.mesh.material = this.material(t.color);
          t.revealT = 0;
        }
      }
      if (t.revealT < 1) {
        t.revealT = Math.min(1, t.revealT + dt / 0.28);
        if (!t.reserved) t.mesh.scale.setScalar(1 + Math.sin(t.revealT * Math.PI) * 0.22);
      }
    }

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
    this.padlock?.dispose();
    this.padlock = null;
    this.ice?.dispose();
    this.ice = null;
    this.mysteryTex.dispose();
    this.mysteryMat.dispose();
    for (const k of this.keys) disposeObject(k.object);
    this.keys = [];
    this.arm.parent?.remove(this.arm);
    this.pivot.removeFromParent();
    this.tileGeo.dispose();
    this.ropeGeo.dispose();
    this.ropeMat.dispose();
    this.barGeo.dispose();
    this.barMat.dispose();
    this.border.geometry.dispose();
    this.outlineMat.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
