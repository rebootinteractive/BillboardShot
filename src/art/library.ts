import type { ColorKey } from '../shared/types';
import { COLOR_KEYS, CHAR_TO_COLOR } from '../shared/colors';

/**
 * The art library: pictures drawn once, reviewed, and reused by levels. A picture is
 * its shape divided into numbered color groups; colors are chosen per level. See
 * docs/level-design-strategy.md, section 3.
 */

export type PictureStatus = 'draft' | 'approved' | 'rejected';

export interface PictureGroup {
  /** What this part of the picture is, e.g. "leaf". */
  part: string;
  /** Colors that keep the picture recognizable, best first. */
  suggest: ColorKey[];
}

/** Where a picture came from. Converted art must carry its source and license. */
export type PictureOrigin =
  | { method: 'drawn' }
  | { method: 'converted'; source: string; license: string; url: string };

export interface Picture {
  id: string;
  name: string;
  tags: string[];
  status: PictureStatus;
  /** Reviewer's note, usually why it was rejected. */
  note?: string;
  origin: PictureOrigin;
  /** Rows top-to-bottom. Digits 1–9 are group ids, '.' is empty. */
  art: string[];
  groups: Record<string, PictureGroup>;
}

/** How a level board was built from a library picture. */
export interface BoardSource {
  picture: string;
  /** A color for every group of the picture. */
  colors: Record<string, ColorKey>;
  /** Groups shown as mystery pixels. */
  hidden?: string[];
  /**
   * Single pixels given another color. Column from the left and row from the top, both
   * from 0. `hidden` defaults to whether the pixel's group is hidden.
   */
  overrides?: Array<{ col: number; row: number; color: ColorKey; hidden?: boolean }>;
}

export const MAX_WIDTH = 16;
export const MAX_HEIGHT = 17;

const COLOR_TO_CHAR = Object.fromEntries(Object.entries(CHAR_TO_COLOR).map(([ch, color]) => [color, ch])) as Record<ColorKey, string>;

/** Everything wrong with a picture, as readable sentences. Empty means valid. */
export function validatePicture(p: Picture, fileName?: string): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9-]+$/.test(p.id ?? '')) errors.push(`id '${p.id}' must be lowercase letters, digits and dashes.`);
  if (fileName !== undefined && fileName !== p.id) errors.push(`id '${p.id}' does not match its file name '${fileName}'.`);
  if (!['draft', 'approved', 'rejected'].includes(p.status)) errors.push(`status '${p.status}' must be draft, approved or rejected.`);
  if (p.origin?.method === 'converted') {
    if (!p.origin.source || !p.origin.license || !p.origin.url) errors.push('converted art needs its source, license and url.');
  } else if (p.origin?.method !== 'drawn') {
    errors.push(`origin.method must be drawn or converted.`);
  }
  if (!p.art?.length) return [...errors, 'art is empty.'];
  if (p.art.length > MAX_HEIGHT) errors.push(`art is ${p.art.length} rows tall; the limit is ${MAX_HEIGHT}.`);
  const width = p.art[0].length;
  if (width > MAX_WIDTH) errors.push(`art is ${width} wide; the limit is ${MAX_WIDTH}.`);
  const used = new Set<string>();
  p.art.forEach((row, r) => {
    if (row.length !== width) errors.push(`row ${r} is ${row.length} wide, expected ${width}.`);
    for (const ch of row) {
      if (ch === '.') continue;
      if (!/[1-9]/.test(ch)) errors.push(`row ${r} has '${ch}'; use digits 1–9 or '.'.`);
      else used.add(ch);
    }
  });
  const islands = countIslands(p.art);
  if (islands > 1) errors.push(`art is ${islands} separate islands; a board must start as one connected shape (up/down/left/right).`);
  for (const id of used) if (!p.groups?.[id]) errors.push(`group ${id} is drawn but not described in groups.`);
  for (const [id, g] of Object.entries(p.groups ?? {})) {
    if (!used.has(id)) errors.push(`group ${id} is described but never drawn.`);
    if (!g.suggest?.length) errors.push(`group ${id} needs at least one suggested color.`);
    for (const c of g.suggest ?? []) if (!COLOR_KEYS.includes(c)) errors.push(`group ${id} suggests unknown color '${c}'.`);
  }
  return errors;
}

/** Connected pieces of non-empty pixels, joined through up/down/left/right neighbors. */
export function countIslands(art: string[]): number {
  const seen = new Set<string>();
  let islands = 0;
  art.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.' || seen.has(`${r},${c}`)) return;
    islands++;
    const stack = [[r, c]];
    seen.add(`${r},${c}`);
    while (stack.length) {
      const [y, x] = stack.pop()!;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${y + dy},${x + dx}`;
        const n = art[y + dy]?.[x + dx];
        if (n && n !== '.' && !seen.has(k)) {
          seen.add(k);
          stack.push([y + dy, x + dx]);
        }
      }
    }
  }));
  return islands;
}

/**
 * The art a level board plays, built from a picture and its source record: color
 * letters, lowercase where hidden.
 */
export function renderSource(picture: Picture, source: BoardSource): string[] {
  const hiddenGroups = new Set(source.hidden ?? []);
  const rows = picture.art.map((row) =>
    [...row].map((ch) => {
      if (ch === '.') return '.';
      const letter = COLOR_TO_CHAR[source.colors[ch]] ?? '?';
      return hiddenGroups.has(ch) ? letter.toLowerCase() : letter;
    }),
  );
  for (const o of source.overrides ?? []) {
    const group = picture.art[o.row]?.[o.col];
    if (!group || group === '.') continue;
    const hidden = o.hidden ?? hiddenGroups.has(group);
    const letter = COLOR_TO_CHAR[o.color] ?? '?';
    rows[o.row][o.col] = hidden ? letter.toLowerCase() : letter;
  }
  return rows.map((r) => r.join(''));
}

/** Problems with a board's source record, including art that no longer matches it. */
export function validateSource(source: BoardSource, art: string[], pictures: Map<string, Picture>): string[] {
  const picture = pictures.get(source.picture);
  if (!picture) return [`source picture '${source.picture}' is not in the library.`];
  const errors: string[] = [];
  for (const id of Object.keys(picture.groups)) {
    const c = source.colors?.[id];
    if (!c) errors.push(`source gives no color for group ${id} (${picture.groups[id].part}).`);
    else if (!COLOR_KEYS.includes(c)) errors.push(`source colors group ${id} with unknown '${c}'.`);
  }
  for (const id of source.hidden ?? []) if (!picture.groups[id]) errors.push(`source hides unknown group ${id}.`);
  for (const o of source.overrides ?? []) {
    const ch = picture.art[o.row]?.[o.col];
    if (!ch || ch === '.') errors.push(`override at col ${o.col}, row ${o.row} is not on a pixel.`);
  }
  if (errors.length) return errors;
  const expected = renderSource(picture, source);
  if (expected.join('\n') !== art.join('\n')) errors.push(`art does not match source picture '${source.picture}' with its colors and overrides.`);
  return errors;
}
