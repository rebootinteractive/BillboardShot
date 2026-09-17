import type { ColorKey } from '../shared/types';
import { COLOR_KEYS } from '../shared/colors';
import type { KeyColor } from '../shared/keyColors';
import { renderSource, type BoardSource, type Picture } from '../art/library';
import { artColor, validateLevel, type BoardData, type ContainerData, type LevelData } from '../game/level';
import { createState, exposedCount, isOpen } from '../rules/sim';

/**
 * A level brief: what a level should be, written before it is built. The builder turns a
 * brief into a level file; the tuner then adjusts its queue until it hits the target.
 * See docs/level-designer-workflow.md.
 */

/** Where in a group to put a key or an odd pixel. */
export type PixelPick = 'highest' | 'middle' | 'lowest';

export type PixelSpot = { col: number; row: number } | { group: string; pick: PixelPick };

export interface BoardBrief {
  picture: string;
  /** Color per group. Groups left out use the picture's first suggested color. */
  colors?: Record<string, ColorKey>;
  /** Groups shown as mystery pixels. */
  hidden?: string[];
  /** Odd pixels of another color. */
  overrides?: Array<PixelSpot & { color: ColorKey }>;
  key?: PixelSpot & { color: KeyColor };
  lock?: { type: 'key'; color: KeyColor } | { type: 'frozen'; color: ColorKey; count: number };
}

export interface LevelBrief {
  /** Level file name without .json. */
  id: string;
  name: string;
  /** What this level is for, in a sentence or two. */
  intent: string;
  hint?: string;
  /** Target band for the difficulty score (the average bot's win rate), 0 to 1. */
  target: { min: number; max: number };
  lanes: number;
  boards: BoardBrief[];
  containers?: {
    /** Largest container; defaults to 40. */
    maxCharges?: number;
    /** Exact number of containers for a color, overriding the default split. */
    split?: Partial<Record<ColorKey, number>>;
  };
  queue?: {
    /** Linked pairs and hidden containers the tuner should place. */
    links?: number;
    hidden?: number;
    /** An explicit queue by color, lane by lane, used as the starting order. */
    order?: ColorKey[][];
    /** Rule warnings accepted on purpose, by rule name (e.g. "locked-only color"). */
    allowWarnings?: string[];
  };
}

export interface BuiltLevel {
  level: LevelData;
  errors: string[];
}

/** A pixel of a picture's group, chosen by position. Rows count from the top. */
export function pickPixel(picture: Picture, spot: PixelSpot): { col: number; row: number } | null {
  if ('col' in spot) return { col: spot.col, row: spot.row };
  const cells: Array<{ col: number; row: number; beneath: boolean }> = [];
  picture.art.forEach((line, row) => [...line].forEach((ch, col) => {
    if (ch !== spot.group) return;
    let beneath = false;
    for (let r = row + 1; r < picture.art.length && !beneath; r++) beneath = picture.art[r][col] !== '.';
    cells.push({ col, row, beneath });
  }));
  if (!cells.length) return null;
  const width = picture.art[0].length;
  const centered = (c: { col: number }) => Math.abs(c.col - (width - 1) / 2);
  if (spot.pick === 'highest') return cells.sort((a, z) => a.row - z.row || centered(a) - centered(z))[0];
  if (spot.pick === 'lowest') {
    // The lowest pixel that still has something beneath it, so it blocks rather than starts exposed.
    const buried = cells.filter((c) => c.beneath);
    return (buried.length ? buried : cells).sort((a, z) => z.row - a.row || centered(a) - centered(z))[0];
  }
  const cx = cells.reduce((s, c) => s + c.col, 0) / cells.length;
  const cy = cells.reduce((s, c) => s + c.row, 0) / cells.length;
  return cells.sort((a, z) => Math.hypot(a.col - cx, a.row - cy) - Math.hypot(z.col - cx, z.row - cy))[0];
}

/** Build the boards of a brief: art, source records, keys and locks. */
function buildBoards(brief: LevelBrief, pictures: Map<string, Picture>, errors: string[]): BoardData[] {
  return brief.boards.map((b, i) => {
    const picture = pictures.get(b.picture);
    if (!picture) {
      errors.push(`Board ${i}: picture '${b.picture}' is not in the library.`);
      return { name: b.picture, art: ['.'] };
    }
    const colors = Object.fromEntries(Object.entries(picture.groups).map(([g, d]) => [g, b.colors?.[g] ?? d.suggest[0]]));
    const overrides = (b.overrides ?? []).flatMap((o) => {
      const at = pickPixel(picture, o);
      if (!at) {
        errors.push(`Board ${i} (${picture.name}): no pixel for override ${JSON.stringify(o)}.`);
        return [];
      }
      return [{ col: at.col, row: at.row, color: o.color }];
    });
    const source: BoardSource = { picture: picture.id, colors, ...(b.hidden?.length ? { hidden: b.hidden } : {}), ...(overrides.length ? { overrides } : {}) };
    const board: BoardData = { name: picture.name, art: renderSource(picture, source), source };
    if (b.key) {
      const at = pickPixel(picture, b.key);
      if (at) board.keys = [{ col: at.col, row: at.row, color: b.key.color }];
      else errors.push(`Board ${i} (${picture.name}): no pixel for the key.`);
    }
    if (b.lock) board.lock = b.lock;
    return board;
  });
}

/** Pixels per color across the boards. */
export function pixelsByColor(boards: BoardData[]): Map<ColorKey, number> {
  const out = new Map<ColorKey, number>();
  for (const b of boards) for (const line of b.art) for (const ch of line) {
    const color = artColor(ch);
    if (color) out.set(color, (out.get(color) ?? 0) + 1);
  }
  return out;
}

/** Split each color into containers of at most `maxCharges`, evenly. */
export function splitContainers(pixels: Map<ColorKey, number>, brief: LevelBrief, errors: string[]): ContainerData[] {
  const max = brief.containers?.maxCharges ?? 40;
  const out: ContainerData[] = [];
  for (const [color, n] of pixels) {
    if (n < 3) {
      errors.push(`${color} has only ${n} pixel${n === 1 ? '' : 's'}; a container needs at least 3. Recolor or add pixels.`);
      continue;
    }
    const count = Math.max(1, Math.min(Math.floor(n / 3), brief.containers?.split?.[color] ?? Math.ceil(n / max)));
    const base = Math.floor(n / count);
    for (let i = 0; i < count; i++) out.push({ color, charges: base + (i < n % count ? 1 : 0) });
  }
  return out;
}

/**
 * A reasonable starting queue: colors that can be pulled at the start come first, colors
 * that wait for an unlock come last, and each color's containers are spread out. Dealt
 * round-robin into lanes.
 */
export function startingQueue(boards: BoardData[], containers: ContainerData[], laneCount: number): ContainerData[][] {
  const state = createState({ name: '', boards, lanes: [[]] });
  const exposed = new Map<string, number>();
  const open = new Map<string, number>();
  const all = new Map<string, number>();
  state.boards.forEach((b) => {
    for (const c of COLOR_KEYS) {
      const idx = COLOR_KEYS.indexOf(c);
      const count = b.color.reduce((n, x) => n + (x === idx ? 1 : 0), 0);
      if (!count) continue;
      all.set(c, (all.get(c) ?? 0) + count);
      if (isOpen(b)) {
        open.set(c, (open.get(c) ?? 0) + count);
        exposed.set(c, (exposed.get(c) ?? 0) + exposedCount(b, idx));
      }
    }
  });
  const seen = new Map<string, number>();
  const keyed = containers.map((c) => {
    const nth = seen.get(c.color) ?? 0;
    seen.set(c.color, nth + 1);
    const lockedShare = 1 - (open.get(c.color) ?? 0) / (all.get(c.color) ?? 1);
    const exposedNow = (exposed.get(c.color) ?? 0) > 0 ? 0 : 1;
    return { c, key: lockedShare * 10 + exposedNow * 3 + nth * 2.5 };
  });
  keyed.sort((a, z) => a.key - z.key);
  const lanes: ContainerData[][] = Array.from({ length: laneCount }, () => []);
  keyed.forEach(({ c }, i) => lanes[i % laneCount].push({ ...c }));
  return lanes;
}

/** Give `count` linked pairs to containers at similar depths in neighboring lanes. */
export function placeLinks(lanes: ContainerData[][], count: number) {
  for (const lane of lanes) for (const c of lane) delete c.link;
  let made = 0;
  for (let depth = 2; depth < 12 && made < count; depth++) {
    for (let k = 0; k + 1 < lanes.length && made < count; k += 2) {
      const a = lanes[k][depth], b = lanes[k + 1][depth + (made % 2)];
      if (!a || !b || a.link || b.link) continue;
      const id = String.fromCharCode(97 + made);
      a.link = id;
      b.link = id;
      made++;
    }
  }
}

/** Mark `count` containers hidden, never at the head of a lane and never two in a row. */
export function placeHidden(lanes: ContainerData[][], count: number) {
  for (const lane of lanes) for (const c of lane) delete c.hidden;
  let made = 0;
  for (let depth = 2; depth < 14 && made < count; depth += 2) {
    for (let k = 0; k < lanes.length && made < count; k++) {
      const c = lanes[(k + depth) % lanes.length][depth];
      if (!c) continue;
      c.hidden = true;
      made++;
    }
  }
}

export function buildLevel(brief: LevelBrief, pictures: Map<string, Picture>): BuiltLevel {
  const errors: string[] = [];
  const boards = buildBoards(brief, pictures, errors);
  const pixels = pixelsByColor(boards);
  let lanes: ContainerData[][];
  if (brief.queue?.order) {
    // An explicit order by color: split each color's pixels across its containers in order.
    const counts = new Map<ColorKey, number>();
    for (const c of brief.queue.order.flat()) counts.set(c, (counts.get(c) ?? 0) + 1);
    const handed = new Map<ColorKey, number>();
    lanes = brief.queue.order.map((lane) => lane.map((color) => {
      const n = pixels.get(color) ?? 0, parts = counts.get(color)!, i = handed.get(color) ?? 0;
      handed.set(color, i + 1);
      return { color, charges: Math.floor(n / parts) + (i < n % parts ? 1 : 0) };
    }));
    for (const [color, n] of pixels) if (!counts.has(color)) errors.push(`queue.order has no container for ${color} (${n} pixels).`);
  } else {
    lanes = startingQueue(boards, splitContainers(pixels, brief, errors), brief.lanes);
  }
  placeLinks(lanes, brief.queue?.links ?? 0);
  placeHidden(lanes, brief.queue?.hidden ?? 0);
  const level: LevelData = { name: brief.name, ...(brief.hint ? { hint: brief.hint } : {}), boards, lanes };
  errors.push(...validateLevel(level, pictures));
  return { level, errors };
}
