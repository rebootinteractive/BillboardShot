import { PICTURES } from '../art/pictures';
import { validateLevel, type LevelData } from './level';

/** Level files, loaded by Vite. Levels are played in filename order. */
const files = import.meta.glob<LevelData>('../levels/*.json', { eager: true, import: 'default' });
const sandboxFiles = import.meta.glob<LevelData>('../levels/sandbox/*.json', { eager: true, import: 'default' });
const devFiles = import.meta.glob<LevelData>('../levels/dev/*.json', { eager: true, import: 'default' });

/** Every level, in play order. */
export const LEVELS: { file: string; data: LevelData }[] = Object.keys(files)
  .sort()
  .map((path) => ({ file: path.split('/').pop()!, data: files[path] }));

/**
 * Levels that are not part of the play order, opened with `?sandbox=<name>`: feature
 * test levels by file name, and earlier development levels as `dev/<file name>`.
 */
export const SANDBOX: Map<string, LevelData> = new Map([
  ...Object.keys(sandboxFiles).map((path) => [path.split('/').pop()!.replace(/\.json$/, ''), sandboxFiles[path]] as const),
  ...Object.keys(devFiles).map((path) => [`dev/${path.split('/').pop()!.replace(/\.json$/, '')}`, devFiles[path]] as const),
]);

/**
 * The level shown as "Level n". Once the last file is beaten the list starts over,
 * while the number the player sees keeps climbing.
 */
export function levelFileForNumber(n: number): { file: string; data: LevelData } {
  const i = (Math.max(1, Math.floor(n)) - 1) % LEVELS.length;
  return LEVELS[i];
}

for (const { file, data } of [...LEVELS, ...[...SANDBOX].map(([file, data]) => ({ file: `sandbox/${file}`, data }))]) {
  const errors = validateLevel(data, PICTURES);
  if (errors.length) console.error(`Level ${file} is invalid:\n- ${errors.join('\n- ')}`);
}
