import type { ColorKey } from '../shared/types';
import { artColor, type ContainerData, type LevelData } from '../game/level';
import { renderSource, type Picture } from './library';

/**
 * Split each color's pixels into containers of at most `max`, colors lower on the
 * board first, dealt round-robin into lanes. Charges always add up to the pixels.
 */
export function dealContainers(boards: string[][], laneCount: number, max = 16): ContainerData[][] {
  const stats = new Map<ColorKey, { pixels: number; height: number }>();
  for (const art of boards) {
    art.forEach((row, r) => {
      for (const ch of row) {
        const color = artColor(ch);
        if (!color) continue;
        const s = stats.get(color) ?? { pixels: 0, height: 0 };
        s.pixels++;
        s.height += art.length - r;
        stats.set(color, s);
      }
    });
  }
  const containers: Array<ContainerData & { order: number }> = [];
  for (const [color, s] of stats) {
    const count = Math.ceil(s.pixels / max);
    const base = Math.floor(s.pixels / count);
    for (let i = 0; i < count; i++) {
      containers.push({ color, charges: base + (i < s.pixels % count ? 1 : 0), order: s.height / s.pixels + i * 3 });
    }
  }
  containers.sort((a, b) => a.order - b.order);
  const lanes: ContainerData[][] = Array.from({ length: laneCount }, () => []);
  containers.forEach(({ color, charges }, i) => lanes[i % laneCount].push({ color, charges }));
  return lanes;
}

/** A one-board level showing a picture in its first suggested colors, for review. */
export function previewLevel(picture: Picture): LevelData {
  const source = {
    picture: picture.id,
    colors: Object.fromEntries(Object.entries(picture.groups).map(([id, g]) => [id, g.suggest[0]])),
  };
  const art = renderSource(picture, source);
  return {
    name: picture.name,
    boards: [{ name: picture.name, art, source }],
    lanes: dealContainers([art], 3, 30),
  };
}
