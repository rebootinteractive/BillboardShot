import type { Picture } from './library';

/** Facts about one color group of a picture. Rows count from the top, like the art. */
export interface GroupFacts {
  id: string;
  part: string;
  pixels: number;
  /** Separate connected pieces (up/down/left/right), e.g. 2 for a pair of eyes. */
  pieces: number;
  /** How many of its pixels are the lowest in their column at the start. */
  exposedPixels: number;
  /** Groups directly beneath some pixel of this one: they must be pulled first. */
  restsOn: string[];
  /** Groups it touches. Giving a touching group the same color merges the two. */
  touches: string[];
  /**
   * True when every pixel has another pixel beneath it, so the group can be hidden as
   * mystery pixels without revealing at the start.
   */
  mysteryCandidate: boolean;
}

export interface PictureFacts {
  width: number;
  height: number;
  pixels: number;
  groups: GroupFacts[];
}

export function analyzePicture(p: Picture): PictureFacts {
  const height = p.art.length;
  const width = p.art[0]?.length ?? 0;
  const at = (col: number, row: number) => {
    const ch = p.art[row]?.[col];
    return ch && ch !== '.' ? ch : null;
  };

  const ids = Object.keys(p.groups).sort();
  const facts = new Map<string, GroupFacts>(ids.map((id) => [id, {
    id, part: p.groups[id].part, pixels: 0, pieces: 0, exposedPixels: 0,
    restsOn: [], touches: [], mysteryCandidate: true,
  }]));
  const restsOn = new Map(ids.map((id) => [id, new Set<string>()]));
  const touches = new Map(ids.map((id) => [id, new Set<string>()]));

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const g = at(col, row);
      if (!g) continue;
      const f = facts.get(g);
      if (!f) continue;
      f.pixels++;
      // The next pixel down the column, skipping holes, is what this one rests on.
      let below: string | null = null;
      for (let r = row + 1; r < height && !below; r++) below = at(col, r);
      if (!below) {
        f.exposedPixels++;
        f.mysteryCandidate = false;
      } else if (below !== g) {
        restsOn.get(g)?.add(below);
      }
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const n = at(col + dc, row + dr);
        if (n && n !== g) {
          touches.get(g)?.add(n);
          touches.get(n)?.add(g);
        }
      }
    }
  }

  // Count connected pieces per group.
  const seen = new Set<string>();
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const g = at(col, row);
      if (!g || seen.has(`${col},${row}`)) continue;
      const f = facts.get(g);
      if (f) f.pieces++;
      const stack = [[col, row]];
      seen.add(`${col},${row}`);
      while (stack.length) {
        const [c, r] = stack.pop()!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const key = `${c + dc},${r + dr}`;
          if (at(c + dc, r + dr) === g && !seen.has(key)) {
            seen.add(key);
            stack.push([c + dc, r + dr]);
          }
        }
      }
    }
  }

  for (const id of ids) {
    const f = facts.get(id)!;
    f.restsOn = [...restsOn.get(id)!].sort();
    f.touches = [...touches.get(id)!].sort();
    if (f.pixels === 0) f.mysteryCandidate = false;
  }
  return {
    width,
    height,
    pixels: [...facts.values()].reduce((sum, f) => sum + f.pixels, 0),
    groups: ids.map((id) => facts.get(id)!),
  };
}
