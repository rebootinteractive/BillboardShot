import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import { loadSettings, saveSettings, type Settings } from '../shared/settings';
import { DebugPanel } from '../ui/DebugPanel';
import { Billboard, type EligibleTarget, type Tile } from './Billboard';
import { Shooter } from './Shooter';
import { Projectile } from './Projectile';
import { buildLevel } from './level';
import { Hud } from './Hud';

const SHOOTER_SCALE = 0.85;
const WALK_SPEED = 4.2;
const RETIRE_TIME = 0.36;

interface DeckSlot {
  pos: THREE.Vector3;
  angle: number;
}

export class GameApp {
  private readonly settings: Settings = loadSettings();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly ro: ResizeObserver;
  private readonly hud: Hud;
  private readonly panel: DebugPanel;
  private rafId = 0;
  private elapsed = 0;

  // ---- world ----
  private readonly world = new THREE.Group();
  private readonly carousel = new THREE.Group();
  private readonly staticStage = new THREE.Group();
  private billboards: Billboard[] = [];
  private deckSlots: DeckSlot[] = [];
  private deckOccupants: (Shooter | null)[] = [];
  private lanes: Shooter[][] = [];
  private projectiles: Projectile[] = [];
  private allShooters: Shooter[] = [];
  /** Shootable pixels inside the firing arc, rebuilt once per frame. */
  private targets: EligibleTarget[] = [];
  private disposables: Array<{ dispose(): void }> = [];

  // ---- shared assets ----
  private readonly shotGeo = new THREE.SphereGeometry(0.075, 10, 8);
  private readonly shotMats = new Map<ColorKey, THREE.MeshBasicMaterial>();

  // ---- input ----
  private pointerDown = false;
  private dragging = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastMoveTime = 0;
  private dragVel = 0;
  private spinVel = 0;
  private autoResumeAt = 0;
  private tapCandidate: Shooter | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly scratch = new THREE.Vector3();
  private readonly scratch2 = new THREE.Vector3();

  private over: 'none' | 'win' | 'lose' = 'none';
  private rebuildTimer: number | undefined;

  constructor(private readonly parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(parent.clientWidth || 393, parent.clientHeight || 852, false);
    parent.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x151824);
    this.scene.fog = new THREE.Fog(0x151824, 18, 34);
    this.camera = new THREE.PerspectiveCamera(52, 393 / 852, 0.1, 100);

    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x1a1d2a, 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 10, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6f8cff, 0.6);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);

    this.world.add(this.carousel, this.staticStage);
    this.scene.add(this.world);

    this.hud = new Hud(parent, { onRestart: () => this.restart() });
    this.panel = new DebugPanel(parent, this.settings, {
      onChange: (structural) => this.onSettingsChanged(structural),
      onRestart: () => this.restart(),
    });

    this.buildWorld();
    this.applyCamera();
    this.attachInput();

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(parent);
    this.handleResize();

    this.clock.start();
    this.loop();

    // Handy for poking at the prototype from the browser console.
    (window as unknown as Record<string, unknown>).__game = this;
  }

  // ------------------------------------------------------------------ build

  private shotMaterial(c: ColorKey) {
    let m = this.shotMats.get(c);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: COLOR_HEX[c] });
      this.shotMats.set(c, m);
    }
    return m;
  }

  private buildWorld() {
    const s = this.settings;
    const plan = buildLevel(s);
    this.over = 'none';
    this.hud.dismiss();

    // --- carousel structure ---
    const ringGeo = new THREE.TorusGeometry(s.carouselRadius, 0.055, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x59617d, roughness: 0.5, metalness: 0.4 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = s.ceilingHeight;
    this.carousel.add(ring);
    this.disposables.push({ dispose: () => { ringGeo.dispose(); ringMat.dispose(); } });

    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, s.ceilingHeight + 1.5, 10);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4056, roughness: 0.6 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = (s.ceilingHeight + 1.5) / 2 - 1.5;
    this.carousel.add(pole);
    const spokeGeo = new THREE.BoxGeometry(s.carouselRadius, 0.05, 0.05);
    for (let i = 0; i < s.billboardCount; i++) {
      const a = (i / s.billboardCount) * Math.PI * 2;
      const spoke = new THREE.Mesh(spokeGeo, ringMat);
      spoke.position.set((Math.sin(a) * s.carouselRadius) / 2, s.ceilingHeight, (Math.cos(a) * s.carouselRadius) / 2);
      spoke.rotation.y = a + Math.PI / 2;
      this.carousel.add(spoke);
    }
    this.disposables.push({ dispose: () => { poleGeo.dispose(); poleMat.dispose(); spokeGeo.dispose(); } });

    // --- billboards ---
    for (let i = 0; i < s.billboardCount; i++) {
      const angle = (i / s.billboardCount) * Math.PI * 2;
      const bb = new Billboard(plan.boards[i], angle, s, i);
      this.carousel.add(bb.arm);
      this.billboards.push(bb);
    }

    // --- deck arc ---
    const arc = THREE.MathUtils.degToRad(s.deckArcDeg);
    const railGeo = new THREE.TorusGeometry(s.carouselRadius, 0.06, 8, 48, arc);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x424a63, roughness: 0.6, metalness: 0.2 });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.rotation.x = -Math.PI / 2;
    rail.rotation.z = -Math.PI / 2 - arc / 2;
    rail.position.y = s.deckY - 0.12;
    this.staticStage.add(rail);
    this.disposables.push({ dispose: () => { railGeo.dispose(); railMat.dispose(); } });

    const padGeo = new THREE.CylinderGeometry(0.36, 0.4, 0.1, 16);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x2e3548, roughness: 0.8 });
    for (let i = 0; i < s.deckSlots; i++) {
      const a = s.deckSlots === 1 ? 0 : -arc / 2 + (i / (s.deckSlots - 1)) * arc;
      const pos = new THREE.Vector3(Math.sin(a) * s.carouselRadius, s.deckY, Math.cos(a) * s.carouselRadius);
      this.deckSlots.push({ pos, angle: a });
      this.deckOccupants.push(null);
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.copy(pos);
      pad.position.y -= 0.04;
      this.staticStage.add(pad);
    }
    this.disposables.push({ dispose: () => { padGeo.dispose(); padMat.dispose(); } });

    // --- queue lines ---
    const laneMat = new THREE.MeshStandardMaterial({ color: 0x232a3b, roughness: 0.9 });
    const headRingGeo = new THREE.RingGeometry(0.34, 0.44, 24);
    const headRingMat = new THREE.MeshBasicMaterial({ color: 0x58e1c4, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    this.disposables.push({ dispose: () => { headRingGeo.dispose(); headRingMat.dispose(); } });
    for (let k = 0; k < s.queueLines; k++) {
      const entries = plan.lanes[k] ?? [];
      const laneLen = Math.max(1, Math.min(entries.length, s.queueVisible));
      const laneGeo = new THREE.BoxGeometry(0.9, 0.06, laneLen * s.queueSpacing + 0.5);
      const laneMesh = new THREE.Mesh(laneGeo, laneMat);
      const lanePos = this.lanePosition(k, (laneLen - 1) / 2);
      laneMesh.position.set(lanePos.x, s.queueY - 0.03, lanePos.z);
      this.staticStage.add(laneMesh);
      this.disposables.push({ dispose: () => laneGeo.dispose() });

      // Ring marking the head of the line — the one a tap will send.
      const headRing = new THREE.Mesh(headRingGeo, headRingMat);
      const headPos = this.lanePosition(k, 0);
      headRing.position.set(headPos.x, s.queueY + 0.01, headPos.z);
      headRing.rotation.x = -Math.PI / 2;
      this.staticStage.add(headRing);

      const lane: Shooter[] = [];
      entries.forEach((e, j) => {
        const sh = new Shooter(e.color, e.charges, SHOOTER_SCALE);
        sh.lane = k;
        // Everyone past the visible window waits stacked at the back of the line.
        const p = this.lanePosition(k, Math.min(j, s.queueVisible));
        sh.group.position.copy(p);
        sh.target.copy(p);
        sh.group.visible = j < s.queueVisible;
        this.staticStage.add(sh.group);
        lane.push(sh);
        this.allShooters.push(sh);
      });
      this.lanes.push(lane);
    }
    this.disposables.push({ dispose: () => laneMat.dispose() });

    const floorGeo = new THREE.CircleGeometry(s.carouselRadius * 2.6, 48);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x191d2b, roughness: 1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = s.queueY - 0.09;
    this.staticStage.add(floor);
    this.disposables.push({ dispose: () => { floorGeo.dispose(); floorMat.dispose(); } });
  }

  /** Index 0 is the head of the line — nearest the deck. The rest trail toward the camera. */
  private lanePosition(lane: number, index: number): THREE.Vector3 {
    const s = this.settings;
    return new THREE.Vector3(
      (lane - (s.queueLines - 1) / 2) * s.queueLaneSpacing,
      s.queueY,
      s.queueHeadZ + index * s.queueSpacing,
    );
  }

  private destroyWorld() {
    for (const p of this.projectiles) {
      p.mesh.parent?.remove(p.mesh);
    }
    this.projectiles = [];
    this.targets.length = 0;
    for (const sh of this.allShooters) sh.dispose();
    this.allShooters = [];
    this.lanes = [];
    this.deckSlots = [];
    this.deckOccupants = [];
    for (const bb of this.billboards) bb.dispose();
    this.billboards = [];
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.carousel.clear();
    this.staticStage.clear();
    this.carousel.rotation.y = 0;
    this.spinVel = 0;
  }

  private restart() {
    this.destroyWorld();
    this.buildWorld();
  }

  private onSettingsChanged(structural: boolean) {
    this.applyCamera();
    if (!structural) return;
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.restart(), 140);
  }

  private applyCamera() {
    const s = this.settings;
    const p = THREE.MathUtils.degToRad(s.camPitchDeg);
    this.camera.fov = s.camFov;
    this.camera.position.set(0, s.camTargetY + s.camDistance * Math.sin(p), s.camDistance * Math.cos(p));
    this.camera.lookAt(0, s.camTargetY, 0);
    this.camera.updateProjectionMatrix();
  }

  private handleResize() {
    const w = this.parent.clientWidth || 393;
    const h = this.parent.clientHeight || 852;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyCamera();
  }

  // ------------------------------------------------------------------ input

  private readonly onDown = (e: PointerEvent) => {
    if (this.over !== 'none') return;
    this.pointerDown = true;
    this.dragging = false;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.lastX = e.clientX;
    this.lastMoveTime = performance.now();
    this.dragVel = 0;
    this.tapCandidate = this.pickShooter(e);
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers have nothing to capture */
    }
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.pointerDown) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    if (!this.dragging) {
      const moved = Math.abs(e.clientX - this.startX) + Math.abs(e.clientY - this.startY);
      if (moved <= 9) return;
      // Only a real drag takes the wheel — a tap must not disturb the spin.
      this.dragging = true;
      this.spinVel = 0;
      this.lastMoveTime = performance.now();
      return;
    }
    const now = performance.now();
    const dt = Math.max(0.008, (now - this.lastMoveTime) / 1000);
    this.lastMoveTime = now;
    const delta = dx * this.settings.dragSensitivity * 0.012;
    this.carousel.rotation.y += delta;
    this.dragVel = THREE.MathUtils.clamp(delta / dt, -6, 6);
  };

  private readonly onUp = (e: PointerEvent) => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    try {
      if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (this.dragging) {
      this.spinVel = this.dragVel;
      // Hand control back to the idle rotation only after a hand-spin.
      this.autoResumeAt = performance.now() + this.settings.resumeAutoDelay * 1000;
    } else if (this.tapCandidate) {
      this.sendToDeck(this.tapCandidate);
    }
    this.tapCandidate = null;
    this.dragging = false;
  };

  private attachInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
  }

  private detachInput() {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
  }

  /**
   * Tapping anywhere on a queue line sends that line's head. Forgiving on a phone,
   * and the head is the only actionable shooter anyway.
   */
  private pickShooter(e: PointerEvent): Shooter | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const lane of this.lanes) for (const sh of lane) if (sh.group.visible) targets.push(sh.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      const id = h.object.userData.shooterId as number | undefined;
      if (id === undefined) continue;
      for (const lane of this.lanes) {
        if (lane.some((s) => s.id === id)) return lane[0] ?? null;
      }
    }
    return null;
  }

  private sendToDeck(sh: Shooter) {
    if (sh.state !== 'queue') return;
    const lane = this.lanes[sh.lane];
    if (!lane || lane[0] !== sh) {
      this.hud.flash('Only the front of a line can go');
      return;
    }
    const slot = this.deckOccupants.indexOf(null);
    if (slot < 0) {
      this.hud.flash('Deck is full');
      return;
    }
    lane.shift();
    this.deckOccupants[slot] = sh;
    sh.slot = slot;
    sh.state = 'walking';
    sh.target.copy(this.deckSlots[slot].pos);
  }

  // ------------------------------------------------------------------ loop

  private readonly loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private tick(dt: number) {
    const s = this.settings;

    // --- carousel spin ---
    if (!this.dragging) {
      this.carousel.rotation.y += this.spinVel * dt;
      this.spinVel *= Math.exp(-s.spinDamping * dt);
      if (Math.abs(this.spinVel) < 0.02) this.spinVel = 0;
      if (performance.now() >= this.autoResumeAt) {
        this.carousel.rotation.y += THREE.MathUtils.degToRad(s.autoRotateDegPerSec) * dt;
      }
    }

    for (const bb of this.billboards) bb.update(dt, this.elapsed, s);

    // Matrices must be current before we map shooters into board space.
    this.world.updateMatrixWorld(true);

    this.buildTargets(s);
    this.updateShooters(dt, s);
    this.updateProjectiles(dt, s);
    this.hud.tick(dt);
    this.updateHud();
    if (this.over === 'none') this.checkEnd();
  }

  private updateShooters(dt: number, s: Settings) {
    // Queue shuffling forward.
    for (let k = 0; k < this.lanes.length; k++) {
      const lane = this.lanes[k];
      const visible = Math.min(lane.length, s.queueVisible);
      for (let j = 0; j < visible; j++) {
        const sh = lane[j];
        sh.group.visible = true;
        sh.target.copy(this.lanePosition(k, j));
        sh.moveToward(dt, WALK_SPEED);
        sh.refreshBadge();
      }
      for (let j = visible; j < lane.length; j++) {
        lane[j].group.visible = false;
        lane[j].group.position.copy(this.lanePosition(k, s.queueVisible));
      }
    }

    for (const sh of this.allShooters) {
      if (sh.state === 'walking') {
        if (sh.moveToward(dt, WALK_SPEED)) {
          sh.state = 'deck';
          sh.cooldown = 0.15;
        }
      } else if (sh.state === 'deck') {
        sh.cooldown -= dt;
        sh.refreshBadge();
        if (sh.charges <= 0) {
          if (sh.inFlight === 0) {
            sh.state = 'retiring';
            sh.retireT = 0;
          }
        } else if (sh.cooldown <= 0) {
          this.tryFire(sh, s);
        }
      } else if (sh.state === 'retiring') {
        sh.retireT += dt / RETIRE_TIME;
        const t = Math.min(1, sh.retireT);
        sh.group.position.y = s.deckY + t * 1.1;
        sh.group.scale.setScalar(Math.max(0.001, 1 - t));
        if (t >= 1) {
          sh.state = 'gone';
          if (sh.slot >= 0 && this.deckOccupants[sh.slot] === sh) this.deckOccupants[sh.slot] = null;
          sh.dispose();
        }
      }
    }
    if (this.allShooters.some((s2) => s2.state === 'gone')) {
      this.allShooters = this.allShooters.filter((s2) => s2.state !== 'gone');
    }
  }

  /**
   * Every shootable pixel currently inside the firing arc. The arc is fixed in
   * world space in front of the camera, so spinning the carousel is what decides
   * which pixels are reachable.
   */
  private buildTargets(s: Settings) {
    this.targets.length = 0;
    for (const bb of this.billboards) {
      if (bb.aliveCount === 0) continue;
      bb.collectEligible(this.targets);
    }
    const half = THREE.MathUtils.degToRad(s.shootArcDeg) / 2;
    let write = 0;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      t.tile.mesh.getWorldPosition(this.scratch);
      const angle = Math.atan2(this.scratch.x, this.scratch.z);
      if (Math.abs(angle) > half) continue;
      t.angle = angle;
      this.targets[write++] = t;
    }
    this.targets.length = write;
  }

  /**
   * One shot spends one charge on one pixel: the lowest row available in the
   * shooter's color, nearest slot breaking ties. Shapes erode from the bottom
   * edge upward rather than being carved into vertical stripes.
   */
  private tryFire(sh: Shooter, s: Settings) {
    const shooterAngle = Math.atan2(sh.group.position.x, sh.group.position.z);
    let best = -1;
    let bestRow = Infinity;
    let bestSpread = Infinity;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.color !== sh.color) continue;
      const row = t.tile.row;
      const spread = Math.abs(t.angle - shooterAngle);
      if (row > bestRow || (row === bestRow && spread >= bestSpread)) continue;
      best = i;
      bestRow = row;
      bestSpread = spread;
    }
    if (best < 0) return;

    const tile = this.targets[best].tile;
    this.targets.splice(best, 1);

    const origin = this.scratch2.copy(sh.group.position);
    origin.y += 0.7 * SHOOTER_SCALE;

    tile.reserved = true;
    tile.mesh.scale.setScalar(0.8);
    const p = new Projectile(
      this.shotGeo,
      this.shotMaterial(sh.color),
      origin,
      tile,
      sh,
      s.projectileSpeed,
      s.projectileArc,
      0,
    );
    this.world.add(p.mesh);
    this.projectiles.push(p);
    sh.inFlight++;
    sh.charges -= 1;
    sh.refreshBadge();
    sh.cooldown = s.fireCooldown;
  }

  private updateProjectiles(dt: number, s: Settings) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.update(dt)) continue;
      const tile: Tile = p.tile;
      tile.mesh.scale.setScalar(1);
      tile.board.destroyTile(tile);
      tile.board.impulse(tile.mesh.position.x, s);
      p.shooter.inFlight = Math.max(0, p.shooter.inFlight - 1);
      p.mesh.parent?.remove(p.mesh);
      this.projectiles.splice(i, 1);
    }
  }

  private remainingByColor(): Map<ColorKey, number> {
    const m = new Map<ColorKey, number>();
    for (const bb of this.billboards) bb.addRemainingCounts(m);
    return m;
  }

  /** Colors any shooter could still hit, i.e. sitting at the bottom of some column. */
  private firableColors(): Set<ColorKey> {
    const set = new Set<ColorKey>();
    for (const bb of this.billboards) bb.addFirableColors(set);
    return set;
  }

  private updateHud() {
    let tiles = 0;
    for (const bb of this.billboards) tiles += bb.aliveCount;
    const deckUsed = this.deckOccupants.filter((o) => o !== null).length;
    let ammo = 0;
    for (const lane of this.lanes) ammo += lane.length;
    this.hud.setStats(tiles, deckUsed, this.deckSlots.length, ammo);
  }

  private checkEnd() {
    let tiles = 0;
    for (const bb of this.billboards) tiles += bb.aliveCount;
    if (tiles === 0) {
      this.over = 'win';
      this.hud.showEnd(true, 'Every pixel knocked off the carousel.');
      return;
    }
    if (this.projectiles.length > 0) return;

    const queueEmpty = this.lanes.every((l) => l.length === 0);
    const deckFull = this.deckOccupants.every((o) => o !== null);
    if (!queueEmpty && !deckFull) return;

    const onDeck = this.allShooters.filter((sh) => sh.state === 'deck' || sh.state === 'walking');
    if (this.allShooters.some((sh) => sh.state === 'retiring')) return;

    // Nothing new can join the deck, so if no shooter on it can ever fire again the
    // board is frozen. "Can ever fire" = its color is at the bottom of some column.
    const firable = this.firableColors();
    const anyUsable = onDeck.some((sh) => sh.charges > 0 && firable.has(sh.color));
    if (anyUsable) return;

    this.over = 'lose';
    this.hud.showEnd(
      false,
      queueEmpty && onDeck.length === 0
        ? 'Out of shooters with pixels still standing.'
        : 'Deck jammed — none of these shooters can reach a pixel any more.',
    );
  }

  /** Debug helper: where each lane head currently sits on screen, in CSS pixels. */
  headScreenPositions(): Array<{ lane: number; x: number; y: number }> {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const out: Array<{ lane: number; x: number; y: number }> = [];
    this.lanes.forEach((lane, k) => {
      const sh = lane[0];
      if (!sh) return;
      v.copy(sh.group.position);
      v.y += 0.4 * SHOOTER_SCALE;
      v.project(this.camera);
      out.push({
        lane: k,
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ teardown

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.rebuildTimer);
    this.detachInput();
    this.ro.disconnect();
    saveSettings(this.settings);
    this.destroyWorld();
    this.shotGeo.dispose();
    for (const m of this.shotMats.values()) m.dispose();
    this.shotMats.clear();
    this.panel.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
