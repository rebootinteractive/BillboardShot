/**
 * Every tunable in the prototype.
 *
 * The values live in `defaults.json`, which is version controlled and is what the
 * deployed build ships. Running locally, the editor panel writes that same file
 * through a dev-server endpoint, so tuning is a matter of dragging a slider and
 * committing the diff. Nothing is kept in localStorage: a visitor to the deployed
 * link always sees exactly the committed tuning.
 *
 * Level content (boards, lanes, containers, deck size) lives in src/levels instead.
 *
 * `structural` fields change the layout of the stage and trigger a rebuild.
 * Everything else applies live on the next frame.
 */
import tuning from './defaults.json';
export interface Settings {
  // --- Camera ---
  camFov: number;
  camDistance: number;
  camPitchDeg: number;
  camTargetY: number;

  // --- Carousel ---
  carouselRadius: number;
  autoRotateDegPerSec: number;
  dragSensitivity: number;
  spinDamping: number;
  /** How quickly the carousel settles onto the focus point after a drag. */
  snapSpeed: number;
  resumeAutoDelay: number;

  // --- Billboards ---
  cellSize: number;
  ceilingHeight: number;
  ropeLength: number;

  // --- Swing ---
  swingStiffness: number;
  swingDamping: number;
  swingImpulse: number;
  ambientSway: number;

  /** Shooters hold fire while the player is dragging the carousel. */
  holdFireWhileDragging: boolean;

  // --- Deck ---
  /** Angle between neighboring deck slots; the arc grows with the level's slot count. */
  deckSlotSpacingDeg: number;
  deckGap: number;

  // --- Queue ---
  queueVisible: number;
  queueLaneSpacing: number;
  queueHeadZ: number;
  queueSpacing: number;
  queueY: number;

  // --- Pulling ---
  /** Maximum visible collected pixels, rounded up to complete 3×3 layers. */
  containerVisibleCubes: number;
  fireCooldown: number;
  projectileSpeed: number;
  projectileArc: number;
}

/** The committed tuning. Typed against Settings, so a missing key fails the build. */
export const DEFAULT_SETTINGS: Settings = tuning;

export interface ToggleDef {
  key: BooleanKey;
  label: string;
  group: string;
  /** structural = the level needs rebuilding when this changes. */
  structural?: boolean;
}

/** Keys whose value is a boolean — the panel renders these as on/off pills. */
type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

export const TOGGLES: ToggleDef[] = [
  { key: 'holdFireWhileDragging', label: 'Hold pulls while dragging', group: 'Pulling' },
];

export interface FieldDef {
  key: Exclude<keyof Settings, BooleanKey>;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  structural?: boolean;
}

export const FIELDS: FieldDef[] = [
  { key: 'camFov', label: 'FOV', group: 'Camera', min: 20, max: 90, step: 1 },
  { key: 'camDistance', label: 'Distance', group: 'Camera', min: 5, max: 40, step: 0.5 },
  { key: 'camPitchDeg', label: 'Pitch (look-down)', group: 'Camera', min: -20, max: 70, step: 1 },
  { key: 'camTargetY', label: 'Aim height', group: 'Camera', min: -2, max: 10, step: 0.1 },

  { key: 'carouselRadius', label: 'Ring radius', group: 'Carousel', min: 1.5, max: 9, step: 0.1, structural: true },
  { key: 'autoRotateDegPerSec', label: 'Auto-rotate °/s', group: 'Carousel', min: 0, max: 60, step: 1 },
  { key: 'dragSensitivity', label: 'Drag sensitivity', group: 'Carousel', min: 0.1, max: 3, step: 0.05 },
  { key: 'spinDamping', label: 'Spin damping', group: 'Carousel', min: 0.2, max: 10, step: 0.1 },
  { key: 'snapSpeed', label: 'Snap speed', group: 'Carousel', min: 1, max: 30, step: 0.5 },
  { key: 'resumeAutoDelay', label: 'Auto resume delay (s)', group: 'Carousel', min: 0, max: 8, step: 0.1 },

  { key: 'cellSize', label: 'Pixel size', group: 'Billboards', min: 0.1, max: 0.6, step: 0.01, structural: true },
  { key: 'ceilingHeight', label: 'Ceiling height', group: 'Billboards', min: 4, max: 14, step: 0.1, structural: true },
  { key: 'ropeLength', label: 'Rope length', group: 'Billboards', min: 0.2, max: 4, step: 0.05, structural: true },

  { key: 'swingStiffness', label: 'Swing stiffness', group: 'Swing', min: 2, max: 80, step: 1 },
  { key: 'swingDamping', label: 'Swing damping', group: 'Swing', min: 0.1, max: 10, step: 0.1 },
  { key: 'swingImpulse', label: 'Hit impulse', group: 'Swing', min: 0, max: 3, step: 0.05 },
  { key: 'ambientSway', label: 'Ambient sway', group: 'Swing', min: 0, max: 3, step: 0.05 },


  { key: 'deckSlotSpacingDeg', label: 'Deck slot spacing °', group: 'Deck', min: 8, max: 30, step: 0.2, structural: true },
  { key: 'deckGap', label: 'Deck gap under boards', group: 'Deck', min: 0, max: 4, step: 0.05, structural: true },

  { key: 'queueVisible', label: 'Visible per line', group: 'Queue', min: 1, max: 12, step: 1, structural: true },
  { key: 'queueLaneSpacing', label: 'Lane spacing', group: 'Queue', min: 0.5, max: 3, step: 0.05, structural: true },
  { key: 'queueHeadZ', label: 'Queue head Z', group: 'Queue', min: 2, max: 12, step: 0.1, structural: true },
  { key: 'queueSpacing', label: 'Queue spacing', group: 'Queue', min: 0.3, max: 2, step: 0.05, structural: true },
  { key: 'queueY', label: 'Queue height', group: 'Queue', min: -2, max: 4, step: 0.05, structural: true },

  { key: 'containerVisibleCubes', label: 'Visible pixels (3×3 layers)', group: 'Pulling', min: 9, max: 108, step: 9 },
  { key: 'fireCooldown', label: 'Pull cooldown (s)', group: 'Pulling', min: 0.05, max: 2, step: 0.05 },
  { key: 'projectileSpeed', label: 'Pull speed', group: 'Pulling', min: 2, max: 30, step: 0.5 },
  { key: 'projectileArc', label: 'Pull arc ×', group: 'Pulling', min: 0, max: 2, step: 0.05 },
];

export type SaveStatus = 'saving' | 'saved' | 'failed';

let statusHandler: ((status: SaveStatus, detail?: string) => void) | null = null;

/** The editor panel subscribes so a failed write is visible rather than silent. */
export function onSaveStatus(fn: ((status: SaveStatus, detail?: string) => void) | null) {
  statusHandler = fn;
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

let pending: Settings | null = null;
let flushTimer: number | undefined;

/**
 * Dev only: write the tuning back to `src/shared/defaults.json` through the dev
 * server. Debounced, because dragging a slider fires on every pixel. In a built
 * bundle this compiles away to nothing.
 */
export function saveSettings(s: Settings) {
  if (!import.meta.env.DEV) return;
  pending = { ...s };
  statusHandler?.('saving');
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flushSettings, 250);
}

async function flushSettings() {
  const body = pending;
  pending = null;
  if (!body) return;
  try {
    const res = await fetch('/__settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body, null, 2),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    statusHandler?.('saved');
  } catch (err) {
    statusHandler?.('failed', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Coerce an arbitrary parsed object into valid Settings: unknown keys dropped,
 * numbers clamped to each field's slider range. Returns null if nothing usable
 * was found.
 */
export function sanitizeSettings(raw: unknown): Settings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  let matched = 0;

  for (const f of FIELDS) {
    const v = src[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[f.key] = Math.min(f.max, Math.max(f.min, v));
    matched++;
  }

  for (const t of TOGGLES) {
    const v = src[t.key];
    if (typeof v !== 'boolean') continue;
    out[t.key] = v;
    matched++;
  }

  return matched > 0 ? out : null;
}
