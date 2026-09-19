import type { ColorKey } from '../shared/types';
import { CHAR_TO_COLOR, COLOR_KEYS } from '../shared/colors';
import { KEY_COLORS, type KeyColor } from '../shared/keyColors';
import { validateSource, type BoardSource, type Picture } from '../art/library';

/**
 * The level format and its checks. Pure: no browser or build-tool APIs, so the simulator
 * can use it too. Loading the level files lives in levels.ts. The format and the rules
 * behind it are documented in docs/level-features.md.
 */
export interface ContainerData {
  color: ColorKey;
  charges: number;
  /** Color and charges stay hidden until it reaches the head of its lane. */
  hidden?: boolean;
  /** Shared by exactly two containers in different lanes; they are sent together. */
  link?: string;
}

/**
 * A key is an object on the board, KEY_WIDTH pixels wide and KEY_HEIGHT tall, with no
 * pixels under it: its cells are '.' in the art. It blocks its columns like a pixel would.
 */
export interface KeyData {
  /** The key's top-left cell: column from the left and row from the top of `art`, both from 0. */
  col: number;
  row: number;
  color: KeyColor;
}

export const KEY_WIDTH = 3;
export const KEY_HEIGHT = 2;

/** The cells a key covers, rows from the top like the art. */
export function keyCells(key: { col: number; row: number }): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < KEY_HEIGHT; r++) for (let c = 0; c < KEY_WIDTH; c++) out.push({ col: key.col + c, row: key.row + r });
  return out;
}

/**
 * A key lock opens when the key of its color is released. A frozen board thaws once
 * `containers` containers of its color have been finished, whatever their size.
 */
export type LockData =
  | { type: 'key'; color: KeyColor }
  | { type: 'frozen'; color: ColorKey; containers: number };

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

/**
 * An input the first levels teach with a pointing hand, one per level.
 *
 * - `send`: tap a lane to send its head to the deck.
 * - `rotate`: drag to turn the carousel. The lanes stay locked until the player turns it,
 *   so the level must open with nothing to pull from the front board.
 */
export type TutorialStep = 'send' | 'rotate';

export interface LevelData {
  name: string;
  /** A one-line explanation shown before the first attempt, e.g. for a new feature. */
  hint?: string;
  /** The input this level teaches. Only the first levels have one. */
  tutorial?: TutorialStep;
  /**
   * Shown before the player enters, so a loss on a peak reads as a challenge taken on
   * rather than a surprise. Only the levels the plan marks as peaks carry one.
   */
  label?: 'hard' | 'very hard';
  /**
   * Size of one pixel in world units, overriding the tuning value. Used to try higher
   * resolution art at the same billboard size.
   */
  cellSize?: number;
  boards: BoardData[];
  /** One array per lane; index 0 is the head of the line. */
  lanes: ContainerData[][];
}

/**
 * A short fingerprint of what makes a level play the way it does: its boards (art, keys,
 * locks) and its lanes. Names and hints don't change it. Playtest results record it, so
 * results from before and after a level changes are never mixed.
 */
export function levelVersion(level: LevelData): string {
  const text = JSON.stringify({
    boards: level.boards.map((b) => ({ art: b.art, keys: b.keys ?? null, lock: b.lock ?? null })),
    lanes: level.lanes,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

/** The color of an art character, or null for empty or unknown. */
export function artColor(ch: string): ColorKey | null {
  return CHAR_TO_COLOR[ch.toUpperCase()] ?? null;
}

export function isMysteryChar(ch: string): boolean {
  return ch !== ch.toUpperCase() && !!CHAR_TO_COLOR[ch.toUpperCase()];
}

/** Everything wrong with a level, as readable sentences. Empty means valid. */
export function validateLevel(level: LevelData, pictures: Map<string, Picture>): string[] {
  const errors: string[] = [];
  if ('deckSlots' in level) errors.push('deckSlots is no longer a level setting: every level uses the global deck size.');
  if (!Array.isArray(level.boards) || level.boards.length === 0) errors.push('A level needs at least one board.');
  if (level.cellSize !== undefined && !(level.cellSize > 0)) errors.push('cellSize must be a positive number.');
  if (level.hint !== undefined && (typeof level.hint !== 'string' || !level.hint.trim())) errors.push('hint must be a non-empty string.');
  if (level.tutorial !== undefined && level.tutorial !== 'send' && level.tutorial !== 'rotate') errors.push(`tutorial '${level.tutorial}' must be 'send' or 'rotate'.`);
  if (level.label !== undefined && level.label !== 'hard' && level.label !== 'very hard') errors.push(`label '${level.label}' must be 'hard' or 'very hard'.`);
  if (level.tutorial === 'rotate' && Array.isArray(level.boards) && level.boards.length < 2) errors.push('the rotate tutorial needs at least two boards to turn between.');
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
    if (board.source) {
      const blanks = (board.keys ?? []).flatMap((k) => keyCells(k));
      for (const e of validateSource(board.source, board.art, pictures, blanks)) errors.push(`${label}: ${e}`);
    }
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

    const covered = new Set<string>();
    for (const key of board.keys ?? []) {
      if (!KEY_COLORS.includes(key.color)) {
        errors.push(`${label} has a key with unknown key color '${key.color}'. Use ${KEY_COLORS.join(', ')}.`);
        continue;
      }
      const at = `${key.color} key at col ${key.col}, row ${key.row}`;
      if (!Number.isInteger(key.col) || !Number.isInteger(key.row) || key.col < 0 || key.row < 0
        || key.col + KEY_WIDTH > width || key.row + KEY_HEIGHT > board.art.length) {
        errors.push(`${label} ${at} does not fit: a key is ${KEY_WIDTH}×${KEY_HEIGHT} and must lie inside the art.`);
      } else {
        for (const cell of keyCells(key)) {
          if (board.art[cell.row][cell.col] !== '.') errors.push(`${label} ${at} covers a pixel at col ${cell.col}, row ${cell.row}; the art must be '.' under a key.`);
          if (covered.has(`${cell.col},${cell.row}`)) errors.push(`${label} ${at} overlaps another key.`);
          covered.add(`${cell.col},${cell.row}`);
        }
      }
      keyHolders.set(key.color, [...(keyHolders.get(key.color) ?? []), b]);
    }

    const lock = board.lock;
    if (lock?.type === 'key') {
      if (!KEY_COLORS.includes(lock.color)) errors.push(`${label} has a lock with unknown key color '${lock.color}'.`);
      else lockHolders.set(lock.color, [...(lockHolders.get(lock.color) ?? []), b]);
    } else if (lock?.type === 'frozen') {
      if (!COLOR_KEYS.includes(lock.color)) errors.push(`${label} is frozen on unknown color '${lock.color}'.`);
      if ('count' in lock) errors.push(`${label}: frozen boards now count finished containers, not pixels. Replace count with containers.`);
      if (!Number.isInteger(lock.containers) || lock.containers < 1) errors.push(`${label} frozen containers must be a whole number of at least 1.`);
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

  // A frozen board counts finished containers of its color, and while it is frozen every
  // pixel they hold comes from other boards. So that many of them, the smallest ones at
  // best, must fit in the pixels elsewhere.
  level.boards.forEach((board, b) => {
    if (board.lock?.type !== 'frozen') return;
    const { color, containers } = board.lock;
    const elsewhere = (pixels.get(color) ?? 0) - (pixelsByBoard[b].get(color) ?? 0);
    const sizes = level.lanes.flat().filter((c) => c.color === color).map((c) => c.charges).sort((a, z) => a - z);
    if (sizes.length < containers) {
      errors.push(`Board ${b} (${board.name}) needs ${containers} finished ${color} containers, but the level has only ${sizes.length}.`);
      return;
    }
    const smallest = sizes.slice(0, containers).reduce((n, x) => n + x, 0);
    if (smallest > elsewhere) {
      errors.push(`Board ${b} (${board.name}) needs ${containers} finished ${color} containers, but even the smallest ${containers} hold ${smallest} and only ${elsewhere} ${color} pixels are on other boards.`);
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
