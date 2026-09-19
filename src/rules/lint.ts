import { COLOR_KEYS } from '../shared/colors';
import { KEY, UNKNOWN, colorName, createState, lowestRow, type State } from './sim';
import { KEY_WIDTH, type LevelData } from '../game/level';

/**
 * Automatic checks for the rules in docs/level-designer-rules.md that can be decided
 * from the level file alone. Warnings point at likely problems; notes are information
 * the designer should be aware of.
 */

export interface LintItem {
  level: 'warning' | 'note';
  rule: string;
  message: string;
}

export const LIMITS = { boards: 6, lanes: 4, colors: 12, width: 16, height: 17, pixels: 1000, minCharges: 3, maxCharges: 40 };

export function lintLevel(level: LevelData): LintItem[] {
  const out: LintItem[] = [];
  const warn = (rule: string, message: string) => out.push({ level: 'warning', rule, message });
  const note = (rule: string, message: string) => out.push({ level: 'note', rule, message });
  const s: State = createState(level);

  // ---- limits
  if (level.boards.length > LIMITS.boards) warn('limits', `${level.boards.length} boards; the limit is ${LIMITS.boards}.`);
  if (level.lanes.length > LIMITS.lanes) warn('limits', `${level.lanes.length} lanes; the limit is ${LIMITS.lanes}.`);
  const pixelsByColor = new Map<number, number>();
  s.boards.forEach((b, i) => {
    if (b.cols > LIMITS.width || b.rows > LIMITS.height) warn('limits', `Board ${i} (${level.boards[i].name}) is ${b.cols}×${b.rows}; the limit is ${LIMITS.width}×${LIMITS.height}.`);
    for (const c of b.color) if (c >= 0) pixelsByColor.set(c, (pixelsByColor.get(c) ?? 0) + 1);
  });
  const pixels = [...pixelsByColor.values()].reduce((a, z) => a + z, 0);
  if (pixels > LIMITS.pixels) warn('limits', `${pixels} pixels; the cap is ${LIMITS.pixels}.`);
  if (pixelsByColor.size > LIMITS.colors) warn('limits', `${pixelsByColor.size} colors; the limit is ${LIMITS.colors}.`);
  level.lanes.forEach((lane, k) => lane.forEach((c, j) => {
    if (c.charges < LIMITS.minCharges || c.charges > LIMITS.maxCharges) warn('limits', `Lane ${k} container ${j} (${c.color}) has ${c.charges} charges; the range is ${LIMITS.minCharges}–${LIMITS.maxCharges}.`);
  }));

  // ---- mystery pixels that reveal at the start (createState already revealed them)
  level.boards.forEach((data, i) => {
    const hiddenInArt = data.art.join('').split('').filter((ch) => ch !== ch.toUpperCase()).length;
    if (!hiddenInArt) return;
    const stillHidden = s.boards[i].hidden.reduce((a, z) => a + z, 0);
    if (stillHidden < hiddenInArt) {
      warn('mystery', `Board ${i} (${data.name}): ${hiddenInArt - stillHidden} of ${hiddenInArt} mystery pixels reveal at the start, because part of their group is the lowest in a column.`);
    }
  });

  // ---- colors that wait for an unlock
  const openPixels = new Map<number, number>();
  const lockedPixels = new Map<number, number>();
  s.boards.forEach((b) => {
    const target = b.lock ? lockedPixels : openPixels;
    for (const c of b.color) if (c >= 0) target.set(c, (target.get(c) ?? 0) + 1);
  });
  for (const [color, locked] of lockedPixels) {
    const open = openPixels.get(color) ?? 0;
    const name = COLOR_KEYS[color];
    if (open === 0) {
      level.lanes.forEach((lane, k) => {
        const first = lane.findIndex((c) => c.color === name);
        if (first >= 0 && first <= 1) warn('locked-only color', `${name} only exists behind a lock (${locked} pixels), but a ${name} container is at position ${first + 1} of lane ${k}. It will park until the unlock.`);
      });
    } else if (open < 3) {
      warn('locked-only color', `${name} has ${open} pixel${open === 1 ? '' : 's'} on open boards and ${locked} behind a lock. A ${name} container can pull the open ones early, then park until the unlock.`);
    }
  }

  // ---- links
  const links = new Map<string, Array<{ lane: number; depth: number }>>();
  level.lanes.forEach((lane, k) => lane.forEach((c, j) => { if (c.link) links.set(c.link, [...(links.get(c.link) ?? []), { lane: k, depth: j }]); }));
  for (const [id, pair] of links) {
    if (pair.length === 2 && Math.abs(pair[0].depth - pair[1].depth) >= 3) {
      warn('links', `Link '${id}' joins positions ${pair[0].depth + 1} and ${pair[1].depth + 1}; the shallower lane is blocked until the deeper partner reaches the front.`);
    }
  }

  // ---- hidden containers in a row
  level.lanes.forEach((lane, k) => {
    for (let j = 1; j < lane.length; j++) {
      if (lane[j].hidden && lane[j - 1].hidden) warn('hidden containers', `Lane ${k} has hidden containers back to back at positions ${j} and ${j + 1}.`);
    }
  });

  // ---- notes: key depth, small color pieces, odd pixels
  s.boards.forEach((b, i) => {
    for (const key of b.keys) {
      let below = 0;
      for (let col = key.col; col < key.col + KEY_WIDTH; col++) for (let row = 0; row < key.row; row++) if (b.color[col * b.rows + row] >= 0) below++;
      note('key depth', `Board ${i} (${level.boards[i].name}) holds a key with ${below} pixel${below === 1 ? '' : 's'} beneath it.`);
    }
  });
  for (const [color, n] of pixelsByColor) {
    if (n < 8) note('small pieces', `${COLOR_KEYS[color]} has only ${n} pixels in the whole level.`);
  }
  level.boards.forEach((data, i) => {
    const overrides = data.source?.overrides?.length ?? 0;
    if (overrides) note('odd pixels', `Board ${i} (${data.name}) has ${overrides} odd pixel${overrides === 1 ? '' : 's'}.`);
  });

  // ---- gating: colors every board needs first
  s.boards.forEach((b, i) => {
    if (b.lock) return;
    const bottoms = new Set<number>();
    for (let col = 0; col < b.cols; col++) {
      const row = lowestRow(b, col);
      if (row < b.rows && b.color[col * b.rows + row] !== KEY) bottoms.add(b.color[col * b.rows + row]);
    }
    if (bottoms.size === 1) {
      const [only] = bottoms;
      if (only === UNKNOWN) return;
      note('gating color', `Board ${i} (${level.boards[i].name}) can only be started with ${colorName(only)}: every column begins with it.`);
    }
  });

  return out;
}
