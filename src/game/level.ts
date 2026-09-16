import type { ColorKey } from '../shared/types';
import { CHAR_TO_COLOR, COLOR_KEYS } from '../shared/colors';

/**
 * Levels are hand-authored JSON files in src/levels, played in filename order.
 * The format and the rules behind it are documented in docs/level-features.md.
 */
export interface ContainerData {
  color: ColorKey;
  charges: number;
}

export interface BoardData {
  name: string;
  /** Rows top-to-bottom. One character per pixel: a color letter, or '.' for empty. */
  art: string[];
}

export interface LevelData {
  name: string;
  deckSlots: number;
  boards: BoardData[];
  /** One array per lane; index 0 is the head of the line. */
  lanes: ContainerData[][];
}

const files = import.meta.glob<LevelData>('../levels/*.json', { eager: true, import: 'default' });

/** Every level, in play order. */
export const LEVELS: { file: string; data: LevelData }[] = Object.keys(files)
  .sort()
  .map((path) => ({ file: path.split('/').pop()!, data: files[path] }));

/**
 * The level shown as "Level n". Once the last file is beaten the list starts over,
 * while the number the player sees keeps climbing.
 */
export function levelForNumber(n: number): LevelData {
  const i = (Math.max(1, Math.floor(n)) - 1) % LEVELS.length;
  return LEVELS[i].data;
}

/** Everything wrong with a level, as readable sentences. Empty means valid. */
export function validateLevel(level: LevelData): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(level.deckSlots) || level.deckSlots < 1) errors.push('deckSlots must be a whole number of at least 1.');
  if (!Array.isArray(level.boards) || level.boards.length === 0) errors.push('A level needs at least one board.');
  if (!Array.isArray(level.lanes) || level.lanes.length === 0) errors.push('A level needs at least one lane.');
  if (errors.length) return errors;

  const pixels = new Map<ColorKey, number>();
  level.boards.forEach((board, b) => {
    const label = `Board ${b} (${board.name})`;
    if (!board.art?.length) {
      errors.push(`${label} has no art.`);
      return;
    }
    const width = board.art[0].length;
    board.art.forEach((row, r) => {
      if (row.length !== width) errors.push(`${label} row ${r} is ${row.length} wide, expected ${width}.`);
      for (const ch of row) {
        if (ch === '.') continue;
        const color = CHAR_TO_COLOR[ch];
        if (!color) errors.push(`${label} row ${r} has unknown character '${ch}'.`);
        else pixels.set(color, (pixels.get(color) ?? 0) + 1);
      }
    });
  });

  const charges = new Map<ColorKey, number>();
  level.lanes.forEach((lane, k) => {
    lane.forEach((c, j) => {
      if (!COLOR_KEYS.includes(c.color)) errors.push(`Lane ${k} container ${j} has unknown color '${c.color}'.`);
      if (!Number.isInteger(c.charges) || c.charges < 1) errors.push(`Lane ${k} container ${j} needs at least 1 charge.`);
      charges.set(c.color, (charges.get(c.color) ?? 0) + c.charges);
    });
  });

  // Zero sum: every charge has exactly one pixel waiting for it.
  for (const color of new Set([...pixels.keys(), ...charges.keys()])) {
    const p = pixels.get(color) ?? 0;
    const c = charges.get(color) ?? 0;
    if (p !== c) errors.push(`${color}: ${p} pixels but ${c} charges.`);
  }
  return errors;
}

for (const { file, data } of LEVELS) {
  const errors = validateLevel(data);
  if (errors.length) console.error(`Level ${file} is invalid:\n- ${errors.join('\n- ')}`);
}
