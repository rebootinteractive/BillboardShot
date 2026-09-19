import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import { loadSettings, type Settings } from '../shared/settings';
import { Billboard, type EligibleTarget, type Tile } from './Billboard';
import { Shooter } from './Shooter';
import { PulledCube } from './PulledCube';
import { levelVersion, type LevelData } from './level';
import { LEVELS, SANDBOX, levelFileForNumber, levelIndexForNumber } from './levels';
import { KEY_HEX, KeyFlight } from './keys';
import { PICTURES } from '../art/pictures';
import { previewLevel } from '../art/preview';
import { LinkChain } from './LinkChain';
import { ProgressShot } from './ProgressShot';
import { Playtest, sendResults } from './analytics';
import { chooseFirers, chooseTarget, isStuck, nextFront, sendBlocker, slotColumn } from '../rules/core';
import { loadLevelNumber, saveLevelNumber } from './progress';
import { Hud } from './Hud';
import { Tutorial } from './Tutorial';
import { Feedback } from './Feedback';
import { roundedBox, pastelBackground, shadowTexture } from './visuals';

const SHOOTER_SCALE = 0.85;
const WALK_SPEED = 4.2;
const RETIRE_TIME = 0.48;
/** How long a full container lingers before it leaves the deck. */
const FULL_HOLD = 0.3;

interface DeckSlot {
  pos: THREE.Vector3;
  angle: number;
}

export class GameApp {
  /** Live tuning. The dev editor mutates this object in place. */
  readonly settings: Settings = loadSettings();
  /** The number the player sees. It keeps climbing after the level list wraps. */
  levelNumber = loadLevelNumber();
  /** A sandbox level being played instead of the numbered ones, from `?sandbox=` or the debug picker. */
  private sandboxName = new URLSearchParams(location.search).get('sandbox');
  /** A library picture previewed as a one-board level, from `?art=`. */
  private artPreview = new URLSearchParams(location.search).get('art');
  private level: { file: string; data: LevelData } = this.resolveLevel();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly ro: ResizeObserver;
  private readonly hud: Hud;
  private readonly tutorial: Tutorial;
  /** The board the rotate tutorial started on: turning away from it is the lesson. */
  private tutorialFrom: Billboard | null = null;
  private readonly feedback: Feedback;
  private readonly background = pastelBackground();
  private readonly contactTexture = shadowTexture();
  private manualTime = new URLSearchParams(location.search).has('test');
  private slotPads: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private rafId = 0;
  private elapsed = 0;

  // ---- world ----
  private readonly world = new THREE.Group();
  private readonly carousel = new THREE.Group();
  private readonly staticStage = new THREE.Group();
  private billboards: Billboard[] = [];
  private reflowTime = 0;
  /** The one board nearest the camera — the only one anything can shoot. */
  private focused: Billboard | null = null;
  private deckSlots: DeckSlot[] = [];
  /** Height of the deck, sat just under the lowest hanging billboard. */
  private deckY = 0;
  private deckOccupants: (Shooter | null)[] = [];
  private lanes: Shooter[][] = [];
  private laneCount = 0;
  /** Cubes currently on their way from a billboard into a container. */
  private pulls: PulledCube[] = [];
  /** Collected keys on their way to the padlock they open. */
  private keyFlights: Array<{ flight: KeyFlight; board: Billboard }> = [];
  private chains: LinkChain[] = [];
  /** Finished containers' loads on their way to frozen billboards. */
  private progressShots: ProgressShot[] = [];
  private allShooters: Shooter[] = [];
  /** Shootable pixels inside the firing arc, rebuilt once per frame. */
  private targets: EligibleTarget[] = [];
  private disposables: Array<{ dispose(): void }> = [];

  // ---- shared assets ----

  // ---- input ----
  private pointerDown = false;
  private dragging = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastMoveTime = 0;
  private dragVel = 0;
  private spinVel = 0;
  /** Rotation the carousel is easing onto so a board lands on the focus point. */
  private snapTarget: number | null = null;
  private autoResumeAt = 0;
  private tapCandidate: Shooter | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tutorialAt = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly scratch2 = new THREE.Vector3();

  private over: 'none' | 'win' | 'lose' = 'none';
  private readonly playtest = new Playtest();
  private winReveal = 0;
  private rebuildTimer: number | undefined;

  constructor(private readonly parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(parent.clientWidth || 393, parent.clientHeight || 852, false);
    parent.appendChild(this.renderer.domElement);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.scene.background = this.background;
    this.camera = new THREE.PerspectiveCamera(52, 393 / 852, 0.1, 100);

    const hemi = new THREE.HemisphereLight(0xfff5df, 0xc39b79, 1.6);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff6e7, 2.3);
    key.position.set(-3, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -7;
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0002;
    key.shadow.intensity = 0.4;
    key.shadow.radius = 7;
    key.shadow.blurSamples = 8;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xd8eaff, 0.8);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);

    this.world.add(this.carousel, this.staticStage);
    this.scene.add(this.world);

    this.hud = new Hud(parent, {
      onRestart: () => this.restart(),
      // A feature test level is not part of progress: Next returns to the player's level.
      onNext: () => this.goToLevel(this.isSideLevel() ? this.levelNumber : this.levelNumber + 1),
      onSendResults: () => {
        this.playtest.persist(this.pixelsLeft());
        void sendResults().then((how) => {
          if (how === 'empty') this.hud.flash('No results yet: play a level first');
          else if (how === 'mail-partial') this.hud.flash('Too many results for one email: please attach the saved file');
        });
      },
    });
    this.tutorial = new Tutorial(parent);
    window.addEventListener('pagehide', this.onPageHide);
    if (new URLSearchParams(location.search).has('debug')) this.enableLevelPicker();
    this.feedback = new Feedback(this.world);

    this.buildWorld();
    this.applyCamera();
    this.attachInput();

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(parent);
    this.handleResize();

    this.clock.start();
    this.loop();

    // Handy for poking at the prototype from the browser console.
    const debug = window as unknown as Record<string, unknown>;
    debug.__game = this;
    debug.render_game_to_text = () => this.renderGameToText();
    debug.advanceTime = (ms: number) => {
      this.manualTime = true;
      for (let remaining = Math.min(ms / 1000, 60); remaining > 0; remaining -= 1 / 60) {
        const dt = Math.min(remaining, 1 / 60);
        this.elapsed += dt;
        this.tick(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
  }

  // ------------------------------------------------------------------ build

  private buildWorld() {
    const s = this.settings;
    this.level = this.resolveLevel();
    const level = this.level.data;
    this.laneCount = level.lanes.length;
    this.over = 'none';
    this.winReveal = 0;
    this.reflowTime = 0;
    this.hud.dismiss();
    this.hud.setLevel(
      this.isSideLevel() ? `· ${level.name}` : String(this.levelNumber),
      this.sandboxName ? `sandbox:${this.sandboxName}` : `level:${levelIndexForNumber(this.levelNumber) + 1}`,
    );
    this.hud.setDifficultyLabel(level.label ?? null);
    const attempt = this.playtest.start({
      level: this.isSideLevel() ? 0 : this.levelNumber,
      file: this.level.file,
      name: level.name,
      version: levelVersion(level),
      pixelsTotal: level.boards.reduce((n, b) => n + b.art.join('').replace(/\./g, '').length, 0),
      deckSlots: s.deckSlots,
    });
    if (level.hint && attempt === 1) this.hud.showIntro(level.hint);
    // The tutorial runs on every attempt: someone who lost level 1 needs it more, not less.
    this.tutorialFrom = null;
    if (level.tutorial) this.tutorial.show(level.tutorial);
    else this.tutorial.hide();

    // --- carousel structure ---
    const ringGeo = new THREE.TorusGeometry(s.carouselRadius, 0.09, 12, 96);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffedce, roughness: 0.38, metalness: 0 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = s.ceilingHeight;
    this.carousel.add(ring);
    this.disposables.push({ dispose: () => { ringGeo.dispose(); ringMat.dispose(); } });

    const poleGeo = new THREE.CylinderGeometry(0.085, 0.12, s.ceilingHeight - s.queueY, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe1b784, roughness: 0.6 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = (s.ceilingHeight + s.queueY) / 2;
    this.carousel.add(pole);
    const spokeGeo = roundedBox(s.carouselRadius, 0.065, 0.065, 0.025);
    this.disposables.push({ dispose: () => { poleGeo.dispose(); poleMat.dispose(); spokeGeo.dispose(); } });

    // --- billboards ---
    level.boards.forEach((data, i) => {
      const angle = (i / level.boards.length) * Math.PI * 2;
      const bb = new Billboard(data, angle, s, i, level.cellSize ?? s.cellSize);
      const spoke = new THREE.Mesh(spokeGeo, ringMat);
      spoke.position.set(0, s.ceilingHeight, s.carouselRadius / 2);
      spoke.rotation.y = Math.PI / 2;
      bb.arm.add(spoke);
      this.carousel.add(bb.arm);
      this.billboards.push(bb);
    });

    // --- deck arc ---
    // Sits directly beneath the near arc of the ring, just under where the artwork
    // bottoms out, so a shot is plainly a short vertical push up into the open frame
    // rather than something lobbed forward from across the room.
    let lowest = 0;
    for (const bb of this.billboards) lowest = Math.min(lowest, bb.bottomOffset);
    this.deckY = s.ceilingHeight + lowest - s.deckGap;

    // Slots keep the same spacing whatever their number, so the arc grows with the deck.
    const spacing = THREE.MathUtils.degToRad(s.deckSlotSpacingDeg);
    const arc = spacing * (s.deckSlots - 1);
    const railArc = Math.max(arc, spacing);
    const railGeo = new THREE.TorusGeometry(s.carouselRadius, 0.06, 8, 48, railArc);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xe5b885, roughness: 0.65, metalness: 0 });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.rotation.x = -Math.PI / 2;
    rail.rotation.z = -Math.PI / 2 - railArc / 2;
    rail.position.y = this.deckY - 0.12;
    this.staticStage.add(rail);
    this.disposables.push({ dispose: () => { railGeo.dispose(); railMat.dispose(); } });

    const padGeo = roundedBox(0.68, 0.13, 0.68, 0.065);
    const padMat = new THREE.MeshStandardMaterial({ color: 0xfff5df, roughness: 0.5 });
    for (let i = 0; i < s.deckSlots; i++) {
      const a = -arc / 2 + i * spacing;
      const pos = new THREE.Vector3(Math.sin(a) * s.carouselRadius, this.deckY, Math.cos(a) * s.carouselRadius);
      this.deckSlots.push({ pos, angle: a });
      this.deckOccupants.push(null);
      const pad = new THREE.Mesh(padGeo, padMat.clone());
      this.slotPads.push(pad);
      pad.receiveShadow = true;
      this.disposables.push(pad.material);
      pad.position.copy(pos);
      pad.position.y -= 0.04;
      this.staticStage.add(pad);
    }
    this.disposables.push({ dispose: () => { padGeo.dispose(); padMat.dispose(); } });

    // --- queue lines ---
    const laneMat = new THREE.MeshStandardMaterial({ color: 0xd6dfe6, roughness: 0.8 });
    const headRingGeo = new THREE.RingGeometry(0.34, 0.44, 24);
    const headRingMat = new THREE.MeshBasicMaterial({ color: 0xfff9e7, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    this.disposables.push({ dispose: () => { headRingGeo.dispose(); headRingMat.dispose(); } });
    for (let k = 0; k < this.laneCount; k++) {
      const entries = level.lanes[k];
      const laneLen = Math.max(1, Math.min(entries.length, s.queueVisible));
      const laneGeo = roundedBox(0.9, 0.12, laneLen * s.queueSpacing + 0.5, 0.06);
      const laneMesh = new THREE.Mesh(laneGeo, laneMat);
      const lanePos = this.lanePosition(k, (laneLen - 1) / 2);
      laneMesh.position.set(lanePos.x, s.queueY - 0.03, lanePos.z);
      laneMesh.receiveShadow = true;
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
        const sh = new Shooter(e.color, e.charges, SHOOTER_SCALE, { hidden: e.hidden });
        if (e.link) sh.userLink = e.link;
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

    // Pair linked containers and hang a chain between each pair.
    const byLink = new Map<string, Shooter[]>();
    for (const sh of this.allShooters) {
      if (sh.userLink) byLink.set(sh.userLink, [...(byLink.get(sh.userLink) ?? []), sh]);
    }
    for (const pair of byLink.values()) {
      if (pair.length !== 2) continue;
      pair[0].partner = pair[1];
      pair[1].partner = pair[0];
      this.chains.push(new LinkChain(this.staticStage, pair[0], pair[1], 0.24 * SHOOTER_SCALE));
    }
    this.disposables.push({ dispose: () => laneMat.dispose() });

    // A shallow cream plinth and soft contact shadows ground the miniature carousel.
    const floorGeo = new THREE.CylinderGeometry(s.carouselRadius * 1.95, s.carouselRadius * 1.95, 0.18, 96);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xcbd3dc, roughness: 0.85 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, s.queueY - 0.2, 1.35);
    floor.receiveShadow = true;
    this.staticStage.add(floor);
    this.disposables.push({ dispose: () => { floorGeo.dispose(); floorMat.dispose(); } });
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    const shadowMat = new THREE.MeshBasicMaterial({ map: this.contactTexture, transparent: true, depthWrite: false });
    const addShadow = (x: number, z: number, w: number, d: number) => {
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(x, s.queueY - 0.1 + 0.002, z);
      shadow.scale.set(w, d, 1);
      this.staticStage.add(shadow);
    };
    addShadow(0, 0, 4.5, 4.5);
    for (let k = 0; k < this.laneCount; k++) {
      const p = this.lanePosition(k, 1.5);
      addShadow(p.x, p.z, 1.4, 4.1);
    }
    this.disposables.push({ dispose: () => { shadowGeo.dispose(); shadowMat.dispose(); } });
  }

  /** Index 0 is the head of the line — nearest the deck. The rest trail toward the camera. */
  private lanePosition(lane: number, index: number): THREE.Vector3 {
    const s = this.settings;
    return new THREE.Vector3(
      (lane - (this.laneCount - 1) / 2) * s.queueLaneSpacing,
      s.queueY,
      s.queueHeadZ + index * s.queueSpacing,
    );
  }

  private destroyWorld() {
    for (const { flight } of this.keyFlights) flight.dispose();
    this.keyFlights = [];
    for (const chain of this.chains) chain.dispose();
    this.chains = [];
    for (const shot of this.progressShots) shot.dispose();
    this.progressShots = [];
    for (const p of this.pulls) {
      p.tile.mesh.parent?.remove(p.tile.mesh);
    }
    this.pulls = [];
    this.targets.length = 0;
    this.feedback.clear();
    this.slotPads = [];
    for (const sh of this.allShooters) sh.dispose();
    this.allShooters = [];
    this.lanes = [];
    this.deckSlots = [];
    this.deckOccupants = [];
    for (const bb of this.billboards) bb.dispose();
    this.billboards = [];
    this.focused = null;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.carousel.clear();
    this.staticStage.clear();
    this.carousel.rotation.y = 0;
    this.spinVel = 0;
    this.snapTarget = null;
    this.pointerDown = false;
    this.dragging = false;
    this.tapCandidate = null;
  }

  /** Rebuild the level from the current tuning. */
  restart() {
    this.playtest.abandon(this.pixelsLeft());
    this.destroyWorld();
    this.buildWorld();
  }

  /** Jump to a level number and remember it as the player's progress. */
  goToLevel(n: number) {
    this.sandboxName = null;
    this.artPreview = null;
    this.levelNumber = Math.max(1, n);
    saveLevelNumber(this.levelNumber);
    this.restart();
  }

  /** Called by the dev editor when a value changes. */
  applySettingsChange(structural: boolean) {
    this.applyCamera();
    if (!structural) return;
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.restart(), 140);
  }

  private spinDampingRate() {
    return Math.max(0.2, this.settings.spinDamping);
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
    this.playtest.input();
    if (this.over !== 'none') return;
    this.feedback.unlock();
    this.pointerDown = true;
    this.dragging = false;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.lastX = e.clientX;
    this.lastMoveTime = performance.now();
    this.dragVel = 0;
    this.snapTarget = null;
    this.tapCandidate = this.pickShooter(e);
    this.tapCandidate?.press(true);
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
      this.tapCandidate?.press(false);
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
    this.tapCandidate?.press(false);
    if (this.dragging) {
      // Let the throw decide which board it was heading for, then settle onto it
      // exactly, so a board always ends up on the focus point.
      const coast = this.spinDampingRate() > 0 ? this.dragVel / this.spinDampingRate() : 0;
      const predicted = this.carousel.rotation.y + coast;
      this.snapTarget = this.nearestBoardSnap(predicted);
      this.spinVel = 0;
      this.autoResumeAt = performance.now() + this.settings.resumeAutoDelay * 1000;
    } else if (this.tapCandidate && e.type !== 'pointercancel') {
      this.sendToDeck(this.tapCandidate);
    }
    this.tapCandidate = null;
    this.dragging = false;
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'f' || e.repeat || (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void this.parent.parentElement?.requestFullscreen?.().catch(() => {});
  };

  private attachInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
  }

  private detachInput() {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
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

  /** Why a lane head cannot be sent right now, or null if it can. */
  private sendBlocker(sh: Shooter): string | null {
    const partner = sh.partner?.state === 'queue' ? sh.partner : null;
    return sendBlocker({
      isHead: this.lanes[sh.lane]?.[0] === sh,
      partner: partner ? { isHead: this.lanes[partner.lane][0] === partner } : null,
      freeSlots: this.deckOccupants.filter((o) => o === null).length,
    });
  }

  private sendToDeck(sh: Shooter) {
    if (sh.state !== 'queue') return;
    // The rotate tutorial holds the lanes shut until the carousel has been turned, so the
    // player cannot skip past the lesson by tapping a container that has nothing to pull.
    if (this.tutorial.active && this.tutorial.current === 'rotate') {
      sh.reject();
      this.hud.flash('Turn the billboards first');
      return;
    }
    const blocker = this.sendBlocker(sh);
    const partner = sh.partner?.state === 'queue' ? sh.partner : null;
    if (blocker) {
      sh.reject();
      if (partner) {
        partner.reject();
        this.chains.find((c) => c.a === sh || c.b === sh)?.flash();
      }
      this.hud.flash(blocker);
      return;
    }
    const group = partner ? [sh, partner] : [sh];
    for (const member of group) {
      const slot = this.deckOccupants.indexOf(null);
      this.lanes[member.lane].shift();
      this.deckOccupants[slot] = member;
      member.slot = slot;
      member.state = 'walking';
      member.target.copy(this.deckSlots[slot].pos);
      member.beginTravel();
    }
    this.feedback.note('tap');
    if (this.tutorial.current === 'send') this.tutorial.complete();
    this.playtest.send(this.deckOccupants.filter((o) => o === null).length);
  }

  /**
   * Keep the pointing hand on what it is pointing at, and retire it once the player has
   * done the gesture. The send hand tracks the head of the middle lane, which reads as
   * "any of these" rather than singling out an edge; the rotate hand sits over the
   * carousel.
   */
  private updateTutorial() {
    if (!this.tutorial.active) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (this.tutorial.current === 'rotate') {
      if (!this.tutorialFrom) this.tutorialFrom = this.focused;
      else if (this.focused && this.focused !== this.tutorialFrom) {
        this.tutorial.complete();
        return;
      }
      this.tutorial.moveTo(rect.width / 2, rect.height * 0.46);
      return;
    }
    const middle = Math.floor(this.lanes.length / 2);
    const head = this.lanes[middle]?.[0] ?? this.lanes.find((lane) => lane.length)?.[0];
    if (!head) return;
    const at = head.group.getWorldPosition(this.tutorialAt).project(this.camera);
    this.tutorial.moveTo((at.x * 0.5 + 0.5) * rect.width, (-at.y * 0.5 + 0.5) * rect.height);
  }

  /** A feature test level or art preview: outside the numbered levels and progress. */
  private isSideLevel() {
    return this.level.file.includes('/');
  }

  /** The level for the current number, or the sandbox level being played. */
  private resolveLevel(): { file: string; data: LevelData } {
    const name = this.sandboxName;
    const sandbox = name ? SANDBOX.get(name) : undefined;
    if (name && !sandbox) {
      console.error(`No sandbox level '${name}'. Available: ${[...SANDBOX.keys()].join(', ')}`);
      this.sandboxName = null;
    }
    if (sandbox) return { file: `sandbox/${name}.json`, data: sandbox };
    // `?art=<picture id>` previews a library picture as a one-board level.
    const picture = this.artPreview ? PICTURES.get(this.artPreview) : undefined;
    if (this.artPreview && !picture) console.error(`No picture '${this.artPreview}' in the art library.`);
    if (picture && !sandbox) return { file: `art/${picture.id}`, data: previewLevel(picture) };
    return levelFileForNumber(this.levelNumber);
  }

  /**
   * Debug mode (`?debug`): the level pill becomes a dropdown of every level and every
   * feature test level. The choice is written to the address so a reload keeps it.
   */
  private enableLevelPicker() {
    const options = [
      ...LEVELS.map(({ data }, i) => ({ value: `level:${i + 1}`, label: `${i + 1}. ${data.name}`, group: 'Levels' })),
      ...[...SANDBOX].map(([name, data]) => ({
        value: `sandbox:${name}`,
        label: data.name,
        group: name.startsWith('dev/') ? 'Development'
          : name.startsWith('trial/') ? 'Trial'
          : name.startsWith('mvp/') ? 'First playtest'
          : 'Feature tests',
      })),
    ];
    const show = (value: string) => {
      const [kind, id] = value.split(':');
      const params = new URLSearchParams(location.search);
      params.delete('level');
      params.delete('sandbox');
      params.delete('art');
      this.artPreview = null;
      if (kind === 'sandbox') {
        this.sandboxName = id;
        params.set('sandbox', id);
        this.restart();
      } else {
        params.set('level', id);
        this.goToLevel(Number(id));
      }
      history.replaceState(null, '', `${location.pathname}?${params.toString().replace(/=(?=&|$)/g, '')}`);
    };
    this.hud.enableLevelPicker(options, show, (delta) => {
      // Stepping always lands in the numbered levels, even from a sandbox level, and
      // wraps at both ends so the arrows are never dead.
      const from = this.isSideLevel() ? 1 : this.levelNumber;
      show(`level:${((from - 1 + delta + LEVELS.length) % LEVELS.length) + 1}`);
    });
  }

  // ------------------------------------------------------------------ loop

  private readonly loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.manualTime) {
      this.elapsed += dt;
      this.tick(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private tick(dt: number) {
    const s = this.settings;
    if (this.over === 'none') this.playtest.tick(dt);
    this.reflowTime = Math.max(0, this.reflowTime - dt);

    // --- carousel spin ---
    if (!this.dragging) {
      if (this.snapTarget !== null) {
        const gap = this.snapTarget - this.carousel.rotation.y;
        if (Math.abs(gap) < 0.0015) {
          this.carousel.rotation.y = this.snapTarget;
          this.snapTarget = null;
        } else {
          this.carousel.rotation.y += gap * (1 - Math.exp(-s.snapSpeed * dt));
        }
      } else {
        this.carousel.rotation.y += this.spinVel * dt;
        this.spinVel *= Math.exp(-s.spinDamping * dt);
        if (Math.abs(this.spinVel) < 0.02) this.spinVel = 0;
        if (this.reflowTime === 0 && performance.now() >= this.autoResumeAt) {
          this.carousel.rotation.y += THREE.MathUtils.degToRad(s.autoRotateDegPerSec) * dt;
        }
      }
    }

    for (const bb of this.billboards) bb.update(dt, this.elapsed, s);

    // Matrices must be current before we map shooters into board space.
    this.world.updateMatrixWorld(true);

    this.updateFocus();
    this.updateTutorial();
    for (const bb of this.billboards) bb.setFocus(bb === this.focused, dt);
    this.slotPads.forEach((pad, i) => {
      const occupant = this.deckOccupants[i];
      const color = new THREE.Color(occupant ? COLOR_HEX[occupant.color] : 0xfff5df);
      if (occupant) color.lerp(new THREE.Color(0xffffff), 0.6);
      pad.material.color.lerp(color, 1 - Math.exp(-8 * dt));
    });
    this.feedback.update(dt);
    this.releaseKeys();
    for (const bb of this.billboards) if (bb.frameState === 'hanging') bb.revealExposed();
    this.buildTargets();
    this.updateKeyFlights(dt);
    this.updateProgressShots(dt);
    for (const chain of this.chains) chain.update(dt, this.elapsed);
    this.updateShooters(dt, s);
    this.updatePulls(dt, s);
    this.retireClearedBoards();
    // After this frame's arrivals, so a cube that just landed is already counted
    // when the pile decides which of the older ones have left the window.
    for (const sh of this.allShooters) {
      sh.updateStack(dt, s.containerVisibleCubes);
      sh.updateVisual(dt, this.camera.quaternion);
    }
    this.hud.tick(dt);
    this.updateHud();
    if (this.over === 'none') this.checkEnd();
    if (this.winReveal > 0) {
      this.winReveal -= dt;
      if (this.winReveal <= 0) this.hud.showEnd(true, `Level ${this.levelNumber} complete. Every pixel collected.`);
    }
  }

  /**
   * Only one shooter per color may fire: the one with the fewest charges left, ties
   * going to the lower slot. Concentrating fire empties that shooter sooner and hands
   * its deck slot back, instead of draining a whole color's shooters in lockstep.
   */
  private pickFirers(): Map<ColorKey, number> {
    const chosen = chooseFirers(this.allShooters.filter((sh) => sh.state === 'deck'));
    const ids = new Map<ColorKey, number>();
    for (const [color, sh] of chosen) ids.set(color as ColorKey, sh.id);
    return ids;
  }

  private updateShooters(dt: number, s: Settings) {
    const firers = this.pickFirers();
    // Aiming and pulling are separate acts: nobody pulls mid-drag.
    const holdFire = this.reflowTime > 0 || (s.holdFireWhileDragging && this.dragging);
    // Queue shuffling forward.
    for (let k = 0; k < this.lanes.length; k++) {
      const lane = this.lanes[k];
      const visible = Math.min(lane.length, s.queueVisible);
      for (let j = 0; j < visible; j++) {
        const sh = lane[j];
        sh.group.visible = true;
        sh.target.copy(this.lanePosition(k, j));
        sh.moveToward(dt, WALK_SPEED);
        // A hidden container shows itself once it is the one a tap would send.
        if (j === 0) sh.reveal();
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
        const isFirer = firers.get(sh.color) === sh.id;
        sh.setActive(isFirer && !holdFire);
        if (sh.charges <= 0) {
          // Hold a beat once the last cube lands, so the full container is seen.
          if (sh.inFlight === 0) {
            sh.fullT += dt;
            if (sh.fullT >= FULL_HOLD) {
              sh.state = 'retiring';
              sh.retireT = 0;
              this.launchProgress(sh);
              this.feedback.burst(sh.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), COLOR_HEX[sh.color], true);
              this.feedback.note('complete');
            }
          }
        } else if (isFirer && !holdFire && sh.cooldown <= 0) {
          this.tryFire(sh, s);
        }
      } else if (sh.state === 'retiring') {
        sh.retireT += dt / RETIRE_TIME;
        const t = Math.min(1, sh.retireT);
        sh.group.position.y = this.deckY + t * t * 1.4;
        sh.group.scale.setScalar(Math.max(0.001, (1 - t * t) * (1 + Math.sin(t * Math.PI) * 0.12)));
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

  /** Pick a real remaining board, including the offset introduced by a reflow. */
  private nearestBoardSnap(rotation: number): number | null {
    let target: number | null = null;
    let closest = Infinity;
    for (const board of this.billboards) {
      if (board.frameState !== 'hanging' || board.aliveCount === 0) continue;
      const delta = GameApp.angleBetween(rotation, -board.targetAngle);
      if (Math.abs(delta) < closest) {
        closest = Math.abs(delta);
        target = rotation + delta;
      }
    }
    return target;
  }

  private retireClearedBoards() {
    const cleared = this.billboards.filter(board => board.frameState === 'hanging' && board.aliveCount === 0);
    if (!cleared.length) return;
    for (const board of cleared) board.dropFrame(this.world);
    const remaining = this.billboards.filter(board => board.frameState === 'hanging');
    this.snapTarget = null;
    this.spinVel = 0;
    if (!remaining.length) {
      this.focused = null;
      this.targets.length = 0;
      return;
    }
    // Keep the focused survivor at the front; if the front board was cleared, the next
    // remaining board in ring order takes its place. Survivors keep their cyclic order
    // and spread around the full circle.
    const frontIndex = this.focused ? this.billboards.indexOf(this.focused) : -1;
    const next = frontIndex >= 0 ? nextFront(this.billboards.length, frontIndex, (i) => this.billboards[i].frameState === 'hanging') : null;
    const anchor = this.focused && remaining.includes(this.focused) ? this.focused
      : next !== null ? this.billboards[next]
      : remaining[0];
    const start = remaining.indexOf(anchor);
    const spacing = Math.PI * 2 / remaining.length;
    for (let i = 0; i < remaining.length; i++) {
      remaining[(start + i) % remaining.length].moveToAngle(-this.carousel.rotation.y + i * spacing);
    }
    this.focused = anchor;
    this.targets.length = 0;
    this.reflowTime = 0.65;
    this.autoResumeAt = performance.now() + this.settings.resumeAutoDelay * 1000;
  }

  /** The board nearest the camera. Focus is shown by the snap, not by scale. */
  private updateFocus() {
    const previous = this.focused;
    this.focusBoard();
    if (previous && this.focused && previous !== this.focused && this.reflowTime === 0) this.playtest.boardChanged();
  }

  private focusBoard() {
    const spin = this.carousel.rotation.y;
    let best: Billboard | null = null;
    let bestOff = Infinity;
    for (const bb of this.billboards) {
      if (bb.frameState !== 'hanging' || bb.aliveCount === 0) continue;
      const off = Math.abs(GameApp.angleBetween(0, bb.angle + spin));
      if (off < bestOff) {
        bestOff = off;
        best = bb;
      }
    }
    this.focused = best;
  }

  /** Every shootable pixel on the focused board. Nothing else can be hit. */
  private buildTargets() {
    this.targets.length = 0;
    const bb = this.focused;
    if (!bb || bb.aliveCount === 0) return;
    bb.collectEligible(this.targets);
    for (const t of this.targets) {
      t.tile.mesh.getWorldPosition(this.scratch);
      t.angle = Math.atan2(this.scratch.x, this.scratch.z);
    }
  }

  /** Shortest signed angle from a to b, so the wrap behind the carousel is handled. */
  private static angleBetween(a: number, b: number) {
    const d = b - a;
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  /**
   * One shot spends one charge on one pixel, and only ever on the focused board.
   * It takes the lowest row available in its color, the target nearest its own slot
   * breaking ties.
   */
  private tryFire(sh: Shooter, s: Settings) {
    const candidates = this.targets.flatMap((t, index) => (t.color === sh.color ? [{ col: t.tile.col, row: t.tile.row, index }] : []));
    if (!candidates.length) return;
    const pick = chooseTarget(candidates, slotColumn(sh.slot, this.deckSlots.length, this.targets[candidates[0].index].board.cols));
    if (!pick) return;
    const best = pick.index;

    const tile = this.targets[best].tile;
    this.targets.splice(best, 1);

    // The real pixel leaves the artwork. Reserving it makes the one above it
    // pullable straight away, exactly as a shot used to.
    tile.reserved = true;
    tile.board.showTrueColor(tile);
    tile.board.impulse(tile.mesh.position.x, s);
    this.pulls.push(new PulledCube(this.world, tile, sh, s.containerVisibleCubes, s.projectileSpeed, s.projectileArc));
    sh.inFlight++;
    sh.charges -= 1;
    sh.refreshBadge();
    sh.cooldown = s.fireCooldown;
  }

  private updatePulls(dt: number, s: Settings) {
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const p = this.pulls[i];
      if (!p.update(dt)) continue;
      const tile: Tile = p.tile;
      const landing = tile.mesh.getWorldPosition(new THREE.Vector3());
      this.feedback.burst(landing, COLOR_HEX[tile.color]);
      this.feedback.note('land');
      tile.board.releaseTile(tile);
      if (tile.board.aliveCount === 0) {
        tile.board.board.getWorldPosition(this.scratch);
        this.feedback.burst(this.scratch, COLOR_HEX[tile.color], true);
      }
      // Each flight owns a distinct 3×3 cell, regardless of arrival order.
      p.container.receiveCube(tile.mesh, tile.board.cell, p.stackIndex);
      p.container.inFlight = Math.max(0, p.container.inFlight - 1);
      this.pulls.splice(i, 1);
    }
    void s;
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

  /**
   * A key with nothing left beneath it leaves its board and flies to the padlock of its
   * color, freeing its columns straight away.
   */
  private releaseKeys() {
    for (const bb of this.billboards) {
      for (const key of bb.releaseFreeKeys()) {
        const target = this.billboards.find((other) => other.lock?.type === 'key' && other.lock.color === key.color);
        const flight = new KeyFlight(this.world, key.object, target?.lockAnchor ?? key.object, key.color, this.camera);
        if (target) this.keyFlights.push({ flight, board: target });
        else flight.dispose();
        this.feedback.note('tap');
      }
    }
  }

  /**
   * A full container is leaving the deck. Frozen billboards of its color only count
   * finished containers: its whole load flies over as a few cubes, each taking its
   * share off the counter as it lands.
   */
  private launchProgress(sh: Shooter) {
    const from = sh.group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    for (const bb of this.billboards) {
      if (bb.frameState !== 'hanging' || bb.lock?.type !== 'frozen' || bb.lock.color !== sh.color) continue;
      const count = Math.min(sh.capacity, 6);
      for (let i = 0; i < count; i++) {
        const share = Math.floor(sh.capacity / count) + (i < sh.capacity % count ? 1 : 0);
        this.progressShots.push(new ProgressShot(this.world, from, bb, sh.color, share, i * 0.08));
      }
    }
  }

  private updateProgressShots(dt: number) {
    for (let i = this.progressShots.length - 1; i >= 0; i--) {
      const shot = this.progressShots[i];
      if (!shot.update(dt)) continue;
      shot.dispose();
      this.progressShots.splice(i, 1);
      shot.board.lockAnchor.getWorldPosition(this.scratch2);
      const thawed = shot.board.addFrozenProgress(shot.amount);
      this.feedback.burst(this.scratch2.clone(), thawed ? 0xbfeaff : 0xffffff, thawed);
      this.feedback.note(thawed ? 'complete' : 'land');
    }
  }

  private updateKeyFlights(dt: number) {
    for (let i = this.keyFlights.length - 1; i >= 0; i--) {
      const { flight, board } = this.keyFlights[i];
      const arrived = flight.update(dt);
      board.keyApproaching(flight.progress);
      if (!arrived) continue;
      flight.dispose();
      this.keyFlights.splice(i, 1);
      board.unlock();
      board.lockAnchor.getWorldPosition(this.scratch2);
      this.feedback.burst(this.scratch2.clone(), KEY_HEX[flight.color], true);
      this.feedback.note('complete');
    }
  }

  private checkEnd() {
    let tiles = 0;
    for (const bb of this.billboards) tiles += bb.aliveCount;
    if (tiles === 0) {
      this.over = 'win';
      this.playtest.finish('win', 0);
      this.winReveal = 0.85;
      // Progress is kept the moment the level is won, even if the page closes before Next.
      if (!this.isSideLevel()) saveLevelNumber(this.levelNumber + 1);
      for (const sh of this.deckOccupants) {
        if (sh) this.feedback.burst(sh.group.position, COLOR_HEX[sh.color], true);
      }
      this.feedback.note('complete');
      return;
    }
    // Something in the air may still unlock or thaw a board when it lands.
    if (this.pulls.length > 0 || this.keyFlights.length > 0 || this.progressShots.length > 0) return;

    const queueEmpty = this.lanes.every((l) => l.length === 0);

    const onDeck = this.allShooters.filter((sh) => sh.state === 'deck' || sh.state === 'walking');
    // A shooter that is leaving, or that has just spent its last charge, is about to
    // hand its slot back. Calling the game before it does declares a jam the player
    // can plainly see is not one — the slot frees a frame later.
    const slotAboutToFree = this.allShooters.some(
      (sh) => sh.state === 'retiring' || (sh.state === 'deck' && sh.charges <= 0),
    );
    if (slotAboutToFree) return;

    // Stuck means no action can ever change anything again: no container on the deck
    // can pull (its color is not at the bottom of a column on an open board), and no
    // lane head can be sent. Locked boards only open by collecting and frozen boards
    // only by finishing containers, so neither can come to the rescue on its own.
    const deckColors = onDeck.flatMap((sh) => (sh.charges > 0 ? [sh.color] : []));
    const anySendable = this.lanes.some((lane) => lane[0] && this.sendBlocker(lane[0]) === null);
    if (!isStuck(deckColors, this.firableColors(), anySendable)) return;

    this.over = 'lose';
    this.playtest.finish('lose', tiles);
    this.hud.showEnd(
      false,
      queueEmpty && onDeck.length === 0
        ? 'Out of containers with pixels still standing.'
        : 'Stuck: no container can reach a pixel, and none can be sent.',
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

  private renderGameToText() {
    return JSON.stringify({
      mode: this.over,
      level: { number: this.levelNumber, name: this.level.data.name, file: this.level.file },
      coordinates: 'Screen positions are CSS pixels, origin top-left. World: +Y up, +Z toward camera.',
      focusedBoard: this.billboards.indexOf(this.focused!),
      rotation: Number(this.carousel.rotation.y.toFixed(3)),
      dragging: this.dragging,
      remaining: this.billboards.reduce((sum, board) => sum + board.aliveCount, 0),
      boards: this.billboards.map(board => ({ remaining: board.aliveCount, frame: board.frameState,
        lock: board.lock ? { ...board.lock } : null,
        lockVisual: board.lockVisualPhase,
        mystery: board.tiles.filter(t => t.alive && t.hidden).length,
        keys: board.keys.map(k => ({ color: k.color, col: k.col, row: k.row })),
        angle: Number(board.angle.toFixed(5)), targetAngle: Number(board.targetAngle.toFixed(5)),
        frameY: Number(board.pivot.position.y.toFixed(3)) })),
      activeBoards: this.billboards.filter(board => board.frameState === 'hanging').length,
      redistributing: this.reflowTime > 0,
      exposedColors: [...new Set(this.targets.map(target => target.color))],
      pulls: this.pulls.length,
      keyFlights: this.keyFlights.length,
      progressShots: this.progressShots.length,
      queue: this.lanes.map(lane => lane.map(sh => ({ color: sh.hidden ? '?' : sh.color, charges: sh.hidden ? '?' : sh.charges,
        linked: !!sh.partner && sh.partner.state === 'queue' }))),
      lanes: this.headScreenPositions().map(head => ({ ...head, color: this.lanes[head.lane][0].color, charges: this.lanes[head.lane][0].charges, count: this.lanes[head.lane].length })),
      deck: this.deckOccupants.map(sh => sh ? ({ color: sh.color, charges: sh.charges, inFlight: sh.inFlight, state: sh.state, packing: sh.packingState() }) : null),
    });
  }

  // ------------------------------------------------------------------ teardown

  private pixelsLeft() {
    return this.billboards.reduce((n, b) => n + b.aliveCount, 0);
  }

  private readonly onPageHide = () => this.playtest.persist(this.pixelsLeft());

  dispose() {
    this.playtest.abandon(this.pixelsLeft());
    window.removeEventListener('pagehide', this.onPageHide);
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.rebuildTimer);
    this.detachInput();
    this.ro.disconnect();
    this.destroyWorld();
    this.hud.dispose();
    this.tutorial.dispose();
    this.feedback.dispose();
    this.background.dispose();
    this.contactTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
