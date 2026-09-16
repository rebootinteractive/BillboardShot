import type { ColorKey } from '../shared/types';
import { CHAR_TO_COLOR, COLOR_KEYS } from '../shared/colors';
import { KEY_COLORS, type KeyColor } from './keys';
import { validateSource, type BoardSource } from '../art/library';

/**
 * Levels are hand-authored JSON files in src/levels, played in filename order.
 * The format and the rules behind it are documented in docs/level-features.md.
 */
export interface ContainerData {
  color: ColorKey;
  charges: number;
  /** Color and charges stay hidden until it reaches the head of its lane. */
  hidden?: boolean;
  /** Shared by exactly two containers in different lanes; they are sent together. */
  link?: string;
}

export interface KeyData {
  /** Column from the left and row from the top of `art`, both from 0. */
  col: number;
  row: number;
  color: KeyColor;
}

export type LockData =
  | { type: 'key'; color: KeyColor }
  | { type: 'frozen'; color: ColorKey; count: number };

export interface BoardData {
  name: string;
  /**
   * Rows top-to-bottom. One character per pixel: an uppercase color letter, the
   * lowercase letter for a mystery pixel of that color, or '.' for empty.
   */
  art: string[];
  keys?: KeyData[];
  lock?: LockData;
  /** The library picture this art was built from, with its colors and overrides. */
  source?: BoardSource;
}

export interface LevelData {
  name: string;
  deckSlots: number;
  /**
   * Size of one pixel in world units, overriding the tuning value. Used to try higher
   * resolution art at the same billboard size.
   */
  cellSize?: number;
  boards: BoardData[];
  /** One array per lane; index 0 is the head of the line. */
  lanes: ContainerData[][];
}

/** The color of an art character, or null for empty or unknown. */
export function artColor(ch: string): ColorKey | null {
  return CHAR_TO_COLOR[ch.toUpperCase()] ?? null;
}

export function isMysteryChar(ch: string): boolean {
  return ch !== ch.toUpperCase() && !!CHAR_TO_COLOR[ch.toUpperCase()];
}

const files = import.meta.glob<LevelData>('../levels/*.json', { eager: true, import: 'default' });
const sandboxFiles = import.meta.glob<LevelData>('../levels/sandbox/*.json', { eager: true, import: 'default' });

/** Every level, in play order. */
export const LEVELS: { file: string; data: LevelData }[] = Object.keys(files)
  .sort()
  .map((path) => ({ file: path.split('/').pop()!, data: files[path] }));

/**
 * Levels that are not part of the play order, opened with `?sandbox=<file name>`.
 * Used to try a single feature in isolation.
 */
export const SANDBOX: Map<string, LevelData> = new Map(
  Object.keys(sandboxFiles).map((path) => [path.split('/').pop()!.replace(/\.json$/, ''), sandboxFiles[path]]),
);

/**
 * The level shown as "Level n". Once the last file is beaten the list starts over,
 * while the number the player sees keeps climbing.
 */
export function levelFileForNumber(n: number): { file: string; data: LevelData } {
  const i = (Math.max(1, Math.floor(n)) - 1) % LEVELS.length;
  return LEVELS[i];
}

/** Everything wrong with a level, as readable sentences. Empty means valid. */
export function validateLevel(level: LevelData): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(level.deckSlots) || level.deckSlots < 1) errors.push('deckSlots must be a whole number of at least 1.');
  if (!Array.isArray(level.boards) || level.boards.length === 0) errors.push('A level needs at least one board.');
  if (level.cellSize !== undefined && !(level.cellSize > 0)) errors.push('cellSize must be a positive number.');
  if (!Array.isArray(level.lanes) || level.lanes.length === 0) errors.push('A level needs at least one lane.');
  if (errors.length) return errors;

  const pixels = new Map<ColorKey, number>();
  const pixelsByBoard: Map<ColorKey, number>[] = [];
  const keyHolders = new Map<string, number[]>();
  const lockHolders = new Map<string, number[]>();

  level.boards.forEach((board, b) => {
    const label = `Board ${b} (${board.name})`;
    const own = new Map<ColorKey, number>();
    pixelsByBoard.push(own);
    if (!board.art?.length) {
      errors.push(`${label} has no art.`);
      return;
    }
    if (board.source) for (const e of validateSource(board.source, board.art)) errors.push(`${label}: ${e}`);
    const width = board.art[0].length;
    board.art.forEach((row, r) => {
      if (row.length !== width) errors.push(`${label} row ${r} is ${row.length} wide, expected ${width}.`);
      for (const ch of row) {
        if (ch === '.') continue;
        const color = artColor(ch);
        if (!color) {
          errors.push(`${label} row ${r} has unknown character '${ch}'.`);
          continue;
        }
        pixels.set(color, (pixels.get(color) ?? 0) + 1);
        own.set(color, (own.get(color) ?? 0) + 1);
      }
    });

    for (const key of board.keys ?? []) {
      if (!KEY_COLORS.includes(key.color)) {
        errors.push(`${label} has a key with unknown key color '${key.color}'. Use ${KEY_COLORS.join(', ')}.`);
        continue;
      }
      const ch = board.art[key.row]?.[key.col];
      if (!ch || ch === '.') errors.push(`${label} ${key.color} key at col ${key.col}, row ${key.row} is not on a pixel.`);
      keyHolders.set(key.color, [...(keyHolders.get(key.color) ?? []), b]);
    }

    const lock = board.lock;
    if (lock?.type === 'key') {
      if (!KEY_COLORS.includes(lock.color)) errors.push(`${label} has a lock with unknown key color '${lock.color}'.`);
      else lockHolders.set(lock.color, [...(lockHolders.get(lock.color) ?? []), b]);
    } else if (lock?.type === 'frozen') {
      if (!COLOR_KEYS.includes(lock.color)) errors.push(`${label} is frozen on unknown color '${lock.color}'.`);
      if (!Number.isInteger(lock.count) || lock.count < 1) errors.push(`${label} frozen count must be a whole number of at least 1.`);
    } else if (lock) {
      errors.push(`${label} has an unknown lock type.`);
    }
  });


  for (const color of new Set([...keyHolders.keys(), ...lockHolders.keys()])) {
    const keys = keyHolders.get(color) ?? [];
    const locks = lockHolders.get(color) ?? [];
    if (keys.length !== 1) errors.push(`Key color ${color} needs exactly one key, found ${keys.length}.`);
    if (locks.length !== 1) errors.push(`Key color ${color} needs exactly one lock, found ${locks.length}.`);
    if (keys.length === 1 && locks.length === 1 && keys[0] === locks[0]) {
      errors.push(`The ${color} key sits on the board it unlocks (board ${keys[0]}).`);
    }
  }

  // Unlock chains cannot loop: follow each locked board to the board holding its key.
  level.boards.forEach((_, start) => {
    const seen = new Set<number>();
    let b: number | undefined = start;
    while (b !== undefined) {
      if (seen.has(b)) {
        errors.push(`Key locks form a loop starting at board ${start}.`);
        return;
      }
      seen.add(b);
      const lock: LockData | undefined = level.boards[b].lock;
      if (lock?.type !== 'key') return;
      const holders = keyHolders.get(lock.color);
      b = holders?.length === 1 ? holders[0] : undefined;
    }
  });

  const charges = new Map<ColorKey, number>();
  const links = new Map<string, number[]>();
  level.lanes.forEach((lane, k) => {
    lane.forEach((c, j) => {
      const label = `Lane ${k} container ${j}`;
      if (!COLOR_KEYS.includes(c.color)) errors.push(`${label} has unknown color '${c.color}'.`);
      if (!Number.isInteger(c.charges) || c.charges < 1) errors.push(`${label} needs at least 1 charge.`);
      if (c.hidden !== undefined && typeof c.hidden !== 'boolean') errors.push(`${label} hidden must be true or false.`);
      if (c.link !== undefined) links.set(c.link, [...(links.get(c.link) ?? []), k]);
      charges.set(c.color, (charges.get(c.color) ?? 0) + c.charges);
    });
  });

  // A frozen board counts only finished containers of its color, and while it is frozen
  // every pixel they hold comes from other boards. So some set of those containers must
  // fit in the pixels elsewhere and still add up to the count.
  level.boards.forEach((board, b) => {
    if (board.lock?.type !== 'frozen') return;
    const { color, count } = board.lock;
    const elsewhere = (pixels.get(color) ?? 0) - (pixelsByBoard[b].get(color) ?? 0);
    const reachable = new Set<number>([0]);
    for (const c of level.lanes.flat()) {
      if (c.color !== color) continue;
      for (const sum of [...reachable]) if (sum + c.charges <= elsewhere) reachable.add(sum + c.charges);
    }
    const best = Math.max(...reachable);
    if (best < count) {
      errors.push(`Board ${b} (${board.name}) needs ${count} ${color} from finished containers, but at most ${best} can be finished from the ${elsewhere} ${color} pixels on other boards.`);
    }
  });

  for (const [id, lanes] of links) {
    if (lanes.length !== 2) errors.push(`Link '${id}' must join exactly two containers, found ${lanes.length}.`);
    else if (lanes[0] === lanes[1]) errors.push(`Link '${id}' joins two containers in the same lane.`);
  }

  // Zero sum: every charge has exactly one pixel waiting for it.
  for (const color of new Set([...pixels.keys(), ...charges.keys()])) {
    const p = pixels.get(color) ?? 0;
    const c = charges.get(color) ?? 0;
    if (p !== c) errors.push(`${color}: ${p} pixels but ${c} charges.`);
  }
  return errors;
}

for (const { file, data } of [...LEVELS, ...[...SANDBOX].map(([file, data]) => ({ file: `sandbox/${file}`, data }))]) {
  const errors = validateLevel(data);
  if (errors.length) console.error(`Level ${file} is invalid:\n- ${errors.join('\n- ')}`);
}
