import type { ColorKey, ShapeDef } from '../shared/types';
import { CHAR_TO_COLOR } from '../shared/colors';
import type { Settings } from '../shared/settings';
import { SHAPES, SHAPE_BY_ID } from './shapes';

export interface QueueEntry {
  color: ColorKey;
  charges: number;
}

export interface LevelPlan {
  boards: ShapeDef[];
  /** One array per lane; index 0 is the head of the line. */
  lanes: QueueEntry[][];
  totalTiles: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildLevel(s: Settings): LevelPlan {
  const rnd = mulberry32(s.seed);

  const pool = s.shapes.map((id) => SHAPE_BY_ID.get(id)).filter((x): x is ShapeDef => !!x);
  const source = pool.length > 0 ? pool : SHAPES;

  const boards: ShapeDef[] = [];
  let bag: ShapeDef[] = [];
  for (let i = 0; i < s.billboardCount; i++) {
    if (bag.length === 0) bag = shuffle(source, rnd);
    boards.push(bag.pop()!);
  }

  // How many tiles of each color are standing at the start.
  const need = new Map<ColorKey, number>();
  let totalTiles = 0;
  for (const b of boards) {
    for (const row of b.rows) {
      for (const ch of row) {
        const c = CHAR_TO_COLOR[ch];
        if (!c) continue;
        need.set(c, (need.get(c) ?? 0) + 1);
        totalTiles++;
      }
    }
  }

  // Enough shooters to clear it, plus the surplus slack.
  const entries: QueueEntry[] = [];
  for (const [color, count] of need) {
    const n = Math.max(1, Math.ceil((count / s.chargesPerShooter) * s.ammoSurplus));
    for (let i = 0; i < n; i++) entries.push({ color, charges: s.chargesPerShooter });
  }

  const deck = shuffle(entries, rnd);
  const lanes: QueueEntry[][] = Array.from({ length: s.queueLines }, () => []);
  deck.forEach((e, i) => lanes[i % s.queueLines].push(e));

  return { boards, lanes, totalTiles };
}
