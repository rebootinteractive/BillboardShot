/**
 * Every tunable in the prototype. Edited from the in-game debug panel and
 * auto-saved to localStorage on every change.
 *
 * `structural` fields change the shape of the level and trigger a rebuild.
 * Everything else applies live on the next frame.
 */
export interface Settings {
  // --- Camera ---
  camFov: number;
  camDistance: number;
  camPitchDeg: number;
  camTargetY: number;

  // --- Carousel ---
  billboardCount: number;
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
  deckSlots: number;
  deckArcDeg: number;
  deckGap: number;

  // --- Queue ---
  queueLines: number;
  queueVisible: number;
  queueLaneSpacing: number;
  queueHeadZ: number;
  queueSpacing: number;
  queueY: number;
  minChargesPerShooter: number;
  chargesPerShooter: number;
  seed: number;

  // --- Firing ---
  fireCooldown: number;
  projectileSpeed: number;
  projectileArc: number;

  // --- Content ---
  shapes: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  camFov: 30,
  camDistance: 21,
  camPitchDeg: 24,
  camTargetY: 5,

  billboardCount: 6,
  carouselRadius: 2.4,
  autoRotateDegPerSec: 0,
  dragSensitivity: 0.9,
  spinDamping: 10,
  snapSpeed: 12,
  resumeAutoDelay: 1.8,

  cellSize: 0.22,
  ceilingHeight: 8.7,
  ropeLength: 0.6,

  swingStiffness: 2,
  swingDamping: 10,
  swingImpulse: 0,
  ambientSway: 0,

  holdFireWhileDragging: true,

  deckSlots: 6,
  deckArcDeg: 76,
  deckGap: 2.2,

  queueLines: 3,
  queueVisible: 4,
  queueLaneSpacing: 1.15,
  queueHeadZ: 2.8,
  queueSpacing: 0.7,
  queueY: 2.25,
  minChargesPerShooter: 3,
  chargesPerShooter: 20,
  seed: 7,

  fireCooldown: 0.05,
  projectileSpeed: 9,
  projectileArc: 1.1,

  shapes: ['heart', 'tree', 'star', 'mushroom', 'smiley', 'ghost'],
};

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
  { key: 'holdFireWhileDragging', label: 'Hold fire while dragging', group: 'Shooting' },
];

export interface FieldDef {
  key: Exclude<keyof Settings, 'shapes' | BooleanKey>;
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

  { key: 'billboardCount', label: 'Billboards', group: 'Carousel', min: 1, max: 10, step: 1, structural: true },
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


  { key: 'deckSlots', label: 'Deck slots', group: 'Deck', min: 1, max: 10, step: 1, structural: true },
  { key: 'deckArcDeg', label: 'Deck arc °', group: 'Deck', min: 10, max: 180, step: 2, structural: true },
  { key: 'deckGap', label: 'Deck gap under boards', group: 'Deck', min: 0, max: 4, step: 0.05, structural: true },

  { key: 'queueLines', label: 'Queue lines', group: 'Queue', min: 1, max: 6, step: 1, structural: true },
  { key: 'queueVisible', label: 'Visible per line', group: 'Queue', min: 1, max: 12, step: 1, structural: true },
  { key: 'queueLaneSpacing', label: 'Lane spacing', group: 'Queue', min: 0.5, max: 3, step: 0.05, structural: true },
  { key: 'queueHeadZ', label: 'Queue head Z', group: 'Queue', min: 2, max: 12, step: 0.1, structural: true },
  { key: 'queueSpacing', label: 'Queue spacing', group: 'Queue', min: 0.3, max: 2, step: 0.05, structural: true },
  { key: 'queueY', label: 'Queue height', group: 'Queue', min: -2, max: 4, step: 0.05, structural: true },
  { key: 'minChargesPerShooter', label: 'Min charges / shooter', group: 'Queue', min: 1, max: 30, step: 1, structural: true },
  { key: 'chargesPerShooter', label: 'Max charges / shooter', group: 'Queue', min: 1, max: 30, step: 1, structural: true },
  { key: 'seed', label: 'Seed', group: 'Queue', min: 1, max: 999, step: 1, structural: true },

  { key: 'fireCooldown', label: 'Fire cooldown (s)', group: 'Firing', min: 0.05, max: 2, step: 0.05 },
  { key: 'projectileSpeed', label: 'Projectile speed', group: 'Firing', min: 2, max: 30, step: 0.5 },
  { key: 'projectileArc', label: 'Projectile arc ×', group: 'Firing', min: 0, max: 2, step: 0.05 },
];

const KEY = 'billboardshot:settings:v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Copy only keys we still recognise, so retired settings don't linger in storage.
    const merged: Settings = { ...DEFAULT_SETTINGS, shapes: [...DEFAULT_SETTINGS.shapes] };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (key in parsed) (merged as unknown as Record<string, unknown>)[key] = parsed[key];
    }
    if (!Array.isArray(merged.shapes) || merged.shapes.length === 0) {
      merged.shapes = [...DEFAULT_SETTINGS.shapes];
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — settings just won't persist */
  }
}

/**
 * Coerce an arbitrary parsed object into valid Settings: unknown keys dropped,
 * numbers clamped to each field's slider range, shapes checked against the
 * known shape ids. Returns null if nothing usable was found.
 */
export function sanitizeSettings(raw: unknown, knownShapeIds: string[]): Settings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS, shapes: [...DEFAULT_SETTINGS.shapes] };
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

  const shapes = src.shapes;
  if (Array.isArray(shapes)) {
    const valid = shapes.filter((x): x is string => typeof x === 'string' && knownShapeIds.includes(x));
    if (valid.length > 0) {
      out.shapes = [...new Set(valid)];
      matched++;
    }
  }

  return matched > 0 ? out : null;
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
