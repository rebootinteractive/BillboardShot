import { PICTURES } from '../art/pictures';
import { validateLevel, type LevelData } from './level';

/**
 * Level files, loaded by Vite. The play order is `levels/production`, in filename order;
 * everything else is reachable only through the debug picker. See docs/level-plan.md.
 */
const files = import.meta.glob<LevelData>('../levels/production/*.json', { eager: true, import: 'default' });
const sandboxFiles = import.meta.glob<LevelData>('../levels/sandbox/*.json', { eager: true, import: 'default' });
const devFiles = import.meta.glob<LevelData>('../levels/dev/*.json', { eager: true, import: 'default' });
const trialFiles = import.meta.glob<LevelData>('../levels/trial/*.json', { eager: true, import: 'default' });
const mvpFiles = import.meta.glob<LevelData>('../levels/mvp/*.json', { eager: true, import: 'default' });

/** Every level, in play order. */
export const LEVELS: { file: string; data: LevelData }[] = Object.keys(files)
  .sort()
  .map((path) => ({ file: path.split('/').pop()!, data: files[path] }));

/**
 * Levels that are not part of the play order, opened with `?sandbox=<name>`: feature
 * test levels by file name, earlier development levels as `dev/<file name>`, levels made
 * by the designer workflow as `trial/<file name>`, and the ten levels of the first
 * playtest as `mvp/<file name>`. The MVP levels are kept because they are what the bots
 * are calibrated against, but they are not part of the game.
 */
export const SANDBOX: Map<string, LevelData> = new Map([
  ...Object.keys(sandboxFiles).map((path) => [path.split('/').pop()!.replace(/\.json$/, ''), sandboxFiles[path]] as const),
  ...Object.keys(devFiles).map((path) => [`dev/${path.split('/').pop()!.replace(/\.json$/, '')}`, devFiles[path]] as const),
  ...Object.keys(trialFiles).map((path) => [`trial/${path.split('/').pop()!.replace(/\.json$/, '')}`, trialFiles[path]] as const),
  ...Object.keys(mvpFiles).map((path) => [`mvp/${path.split('/').pop()!.replace(/\.json$/, '')}`, mvpFiles[path]] as const),
]);

/**
 * Where the game loops back to after the last level, counting from 1.
 *
 * Not level 1: somebody who has beaten the whole game should not be handed a one-board
 * tutorial with a pointing hand. Level 25 is the first level after the last feature is
 * introduced, so everything from here assumes the player knows all five, uses all five
 * across its span, and contains none of the deliberately-trivial levels that teach them.
 * It also opens at a medium, which is the right breath after the finale.
 */
export const LOOP_START = 25;

/**
 * The level shown as "Level n". Once the last file is beaten the list starts over from
 * LOOP_START, while the number the player sees keeps climbing.
 */
export function levelIndexForNumber(n: number): number {
  const i = Math.max(1, Math.floor(n)) - 1;
  if (i < LEVELS.length) return i;
  // Loop over the tail. Guard the span in case the list is ever shorter than LOOP_START.
  const first = Math.min(LOOP_START - 1, LEVELS.length - 1);
  const span = LEVELS.length - first;
  return first + ((i - LEVELS.length) % span);
}

export function levelFileForNumber(n: number): { file: string; data: LevelData } {
  if (!LEVELS.length) throw new Error('No levels in src/levels/production. See docs/level-plan.md.');
  return LEVELS[levelIndexForNumber(n)];
}

for (const { file, data } of [...LEVELS, ...[...SANDBOX].map(([file, data]) => ({ file: `sandbox/${file}`, data }))]) {
  const errors = validateLevel(data, PICTURES);
  if (errors.length) console.error(`Level ${file} is invalid:\n- ${errors.join('\n- ')}`);
}
