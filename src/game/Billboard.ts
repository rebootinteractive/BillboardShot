import * as THREE from 'three';
import { roundedBox, beveledBorder } from './visuals';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import type { Settings } from '../shared/settings';
import { artColor, isMysteryChar, type BoardData } from './level';
import { KEY_HEX, drawCounter, keyTexture, mysteryTexture, type KeyColor } from './keys';

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
  /** The key sitting on this pixel, collected when the pixel lands. */
  key: KeyColor | null;
  keyIcon: THREE.Mesh | null;
}

export type BoardLock =
  | { type: 'key'; color: KeyColor }
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
  /** Where a flying key heads for: the padlock, or the middle of the board. */
  readonly lockAnchor = new THREE.Object3D();
  private overlay: THREE.Group | null = null;
  private overlayMats: THREE.Material[] = [];
  private overlayGeos: THREE.BufferGeometry[] = [];
  private shackle: THREE.Object3D | null = null;
  private counterCanvas: HTMLCanvasElement | null = null;
  private counterTex: THREE.CanvasTexture | null = null;
  private counterLabel: THREE.Object3D | null = null;
  /** 1→0 while the counter bumps after a delivery. */
  private counterPulse = 0;
  private unlockT = -1;
  /** Each overlay material's opacity when the unlock began, so the fade starts from it. */
  private overlayOpacity: number[] = [];
  private readonly mysteryTex = mysteryTexture();
  private readonly mysteryMat = new THREE.MeshStandardMaterial({ map: this.mysteryTex, roughness: 0.4 });
  private readonly keyTextures = new Map<KeyColor, THREE.CanvasTexture>();
  private readonly keyMats = new Map<KeyColor, THREE.MeshBasicMaterial>();
  private readonly keyGeo: THREE.PlaneGeometry;

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
  private readonly outlineGeo: THREE.BufferGeometry;
  private readonly outlineMat: THREE.MeshStandardMaterial;
  private readonly mats = new Map<ColorKey, THREE.MeshStandardMaterial>();

  constructor(data: BoardData, angle: number, s: Settings, index: number) {
    const art = data.art;
    this.cols = art[0].length;
    this.rows = art.length;
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
    // Larger than a pixel, so the key reads at a glance from across the carousel.
    this.keyGeo = new THREE.PlaneGeometry(this.cell * 1.6, this.cell * 1.6);
    // Keys are written with rows from the top, like the art.
    const keyAt = new Map((data.keys ?? []).map((k) => [`${k.col},${this.rows - 1 - k.row}`, k.color]));

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
        const key = keyAt.get(`${c},${r}`) ?? null;
        let keyIcon: THREE.Mesh | null = null;
        if (key) {
          keyIcon = new THREE.Mesh(this.keyGeo, this.keyMaterial(key));
          keyIcon.position.z = this.cell * 0.4;
          keyIcon.renderOrder = 3;
          mesh.add(keyIcon);
        }
        const tile: Tile = {
          col: c, row: r, color, mesh, alive: true, reserved: false, popT: -1, board: this,
          hidden, revealDelay: -1, revealT: 1, key, keyIcon,
        };
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

    this.board.add(this.lockAnchor);
    this.lockAnchor.position.z = this.cell * 0.9;
    if (data.lock?.type === 'key') {
      this.lock = { type: 'key', color: data.lock.color };
      this.buildPadlock(data.lock.color);
    } else if (data.lock?.type === 'frozen') {
      this.lock = { type: 'frozen', color: data.lock.color, remaining: data.lock.count };
      this.buildIce();
    }
  }

  private keyMaterial(color: KeyColor) {
    let m = this.keyMats.get(color);
    if (!m) {
      const tex = keyTexture(color);
      this.keyTextures.set(color, tex);
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      this.keyMats.set(color, m);
    }
    return m;
  }

  private overlayMesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
    this.overlayGeos.push(geo);
    if (!this.overlayMats.includes(mat)) this.overlayMats.push(mat);
    return new THREE.Mesh(geo, mat);
  }

  /** Two straps across the artwork and a padlock in the key's color. */
  private buildPadlock(color: KeyColor) {
    const cell = this.cell;
    const w = this.cols * cell;
    const h = this.rows * cell;
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: KEY_HEX[color], roughness: 0.3, metalness: 0.35 });
    const strap = new THREE.MeshStandardMaterial({
      color: new THREE.Color(KEY_HEX[color]).multiplyScalar(0.72), roughness: 0.5, metalness: 0.2,
    });
    const diagonal = Math.hypot(w, h);
    for (const sign of [-1, 1]) {
      const band = this.overlayMesh(roundedBox(diagonal, cell * 0.55, cell * 0.2, cell * 0.08), strap);
      band.rotation.z = sign * Math.atan2(h, w);
      band.position.z = cell * 0.5;
      band.castShadow = true;
      group.add(band);
    }
    const body = this.overlayMesh(roundedBox(cell * 2.6, cell * 2.2, cell * 0.9, cell * 0.3), metal);
    body.position.z = cell * 0.95;
    body.castShadow = true;
    group.add(body);
    const shackle = this.overlayMesh(new THREE.TorusGeometry(cell * 0.8, cell * 0.22, 10, 24, Math.PI), metal);
    const shackleHolder = new THREE.Group();
    shackleHolder.position.set(0, cell * 1.05, cell * 0.95);
    shackleHolder.add(shackle);
    group.add(shackleHolder);
    this.shackle = shackleHolder;
    const holeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(KEY_HEX[color]).multiplyScalar(0.3) });
    const hole = this.overlayMesh(new THREE.CircleGeometry(cell * 0.28, 16), holeMat);
    hole.position.set(0, cell * 0.15, cell * 1.42);
    group.add(hole);
    const slot = this.overlayMesh(new THREE.PlaneGeometry(cell * 0.18, cell * 0.55), holeMat);
    slot.position.set(0, -cell * 0.25, cell * 1.42);
    group.add(slot);
    this.lockAnchor.position.set(0, 0, cell * 1.5);
    this.overlay = group;
    this.board.add(group);
  }

  /** A sheet of ice over the artwork with the color and count still needed. */
  private buildIce() {
    if (this.lock?.type !== 'frozen') return;
    const cell = this.cell;
    const group = new THREE.Group();
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xdff5ff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.66,
      emissive: 0x6fb8d8, emissiveIntensity: 0.12,
    });
    const ice = this.overlayMesh(
      roundedBox(this.cols * cell + cell * 0.5, this.rows * cell + cell * 0.5, cell * 0.3, cell * 0.3), iceMat);
    ice.position.z = cell * 0.52;
    group.add(ice);
    this.counterCanvas = document.createElement('canvas');
    this.counterCanvas.width = 256;
    this.counterCanvas.height = 128;
    this.counterTex = new THREE.CanvasTexture(this.counterCanvas);
    this.counterTex.colorSpace = THREE.SRGBColorSpace;
    const labelMat = new THREE.MeshBasicMaterial({ map: this.counterTex, transparent: true, toneMapped: false });
    const label = this.overlayMesh(new THREE.PlaneGeometry(cell * 4.4, cell * 2.2), labelMat);
    label.position.z = cell * 0.72;
    label.renderOrder = 4;
    group.add(label);
    this.counterLabel = label;
    this.refreshCounter();
    this.lockAnchor.position.set(0, 0, cell * 0.8);
    this.overlay = group;
    this.board.add(group);
  }

  private refreshCounter() {
    if (this.lock?.type !== 'frozen' || !this.counterCanvas || !this.counterTex) return;
    drawCounter(this.counterCanvas.getContext('2d')!, String(this.lock.remaining), { swatch: this.lock.color, icy: true });
    this.counterTex.needsUpdate = true;
  }

  /**
   * Pixels delivered by a finished container of the frozen color. Returns true if this
   * thawed the board.
   */
  addFrozenProgress(amount: number): boolean {
    if (this.lock?.type !== 'frozen') return false;
    this.lock.remaining = Math.max(0, this.lock.remaining - amount);
    this.refreshCounter();
    this.counterPulse = 1;
    if (this.lock.remaining > 0) return false;
    this.unlock();
    return true;
  }

  /** Lift the lock now; the cover animates away over the next half second. */
  unlock() {
    if (!this.lock) return;
    this.lock = null;
    this.unlockT = 0;
    this.overlayOpacity = this.overlayMats.map((m) => m.opacity);
    for (const m of this.overlayMats) {
      m.transparent = true;
      m.needsUpdate = true;
    }
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
    const queue: Array<[Tile, number]> = [[start, 0]];
    const seen = new Set<Tile>([start]);
    while (queue.length) {
      const [tile, distance] = queue.shift()!;
      if (tile.hidden) {
        tile.hidden = false;
        tile.revealDelay = distance * 0.045;
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = this.grid[tile.col + dc]?.[tile.row + dr];
        // Pixels still in flight count as present; collected ones do not connect.
        if (!next || !next.alive || next.color !== start.color || seen.has(next)) continue;
        seen.add(next);
        queue.push([next, distance + 1]);
      }
    }
  }

  /** Show a revealed pixel's color straight away, e.g. as it is pulled. */
  showTrueColor(tile: Tile) {
    if (tile.revealDelay < 0) return;
    tile.revealDelay = -1;
    tile.mesh.material = this.material(tile.color);
  }

  /** Remove the key icon from a pixel whose key has been collected. */
  takeKey(tile: Tile) {
    tile.keyIcon?.removeFromParent();
    tile.keyIcon = null;
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
    if (this.locked) return;
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

    if (this.counterPulse > 0 && this.counterLabel) {
      this.counterPulse = Math.max(0, this.counterPulse - dt / 0.3);
      this.counterLabel.scale.setScalar(1 + Math.sin(this.counterPulse * Math.PI) * 0.25);
    }
    this.updateUnlock(dt);

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

  private updateUnlock(dt: number) {
    if (this.unlockT < 0 || !this.overlay) return;
    this.unlockT = Math.min(1, this.unlockT + dt / 0.55);
    const t = this.unlockT;
    if (this.shackle) this.shackle.position.y = this.cell * (1.05 + THREE.MathUtils.smoothstep(t, 0, 0.3) * 0.7);
    const fade = THREE.MathUtils.smoothstep(t, 0.3, 1);
    this.overlay.scale.setScalar(1 + fade * 0.18);
    this.overlayMats.forEach((m, i) => { m.opacity = this.overlayOpacity[i] * (1 - fade); });
    if (t >= 1) {
      this.overlay.removeFromParent();
      this.disposeOverlay();
      this.unlockT = -1;
    }
  }

  private disposeOverlay() {
    for (const g of this.overlayGeos) g.dispose();
    for (const m of this.overlayMats) m.dispose();
    this.counterTex?.dispose();
    this.overlayGeos = [];
    this.overlayMats = [];
    this.overlay = null;
    this.shackle = null;
    this.counterTex = null;
    this.counterCanvas = null;
    this.counterLabel = null;
  }

  dispose() {
    this.disposeOverlay();
    this.mysteryTex.dispose();
    this.mysteryMat.dispose();
    this.keyGeo.dispose();
    for (const m of this.keyMats.values()) m.dispose();
    for (const t of this.keyTextures.values()) t.dispose();
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
