#!/usr/bin/env node
/**
 * Level report from the command line:
 *
 *   npm run sim                      every level in play order
 *   npm run sim -- src/levels/level-04.json [more files]
 *   npm run sim -- --runs 400 --careful 80 --json report.json
 *
 * Bundles src/rules with esbuild, then plays each level with the solver and the three
 * bots. See docs/level-design-strategy.md for what the numbers mean.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const runs = Number(flag('runs', 200));
const careful = Number(flag('careful', 40));
const jsonOut = flag('json', null);
const verbose = args.includes('--notes');
const files = args.filter((a) => !a.startsWith('--'));

const outfile = path.join(root, 'node_modules/.cache/billboardshot-sim/rules.mjs');
await build({ entryPoints: [path.join(root, 'src/rules/index.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
const rules = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);

const pictureDir = path.join(root, 'src/art/pictures');
const pictures = new Map(fs.readdirSync(pictureDir).filter((f) => f.endsWith('.json')).map((f) => {
  const p = JSON.parse(fs.readFileSync(path.join(pictureDir, f), 'utf8'));
  return [p.id, p];
}));

const levelDir = path.join(root, 'src/levels');
const targets = files.length ? files.map((f) => path.resolve(f)) : fs.readdirSync(levelDir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(levelDir, f));

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const reports = [];
for (const file of targets) {
  const level = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t0 = Date.now();
  const r = rules.reportLevel(level, pictures, { runs: { careless: runs, average: runs, careful } });
  reports.push({ file: path.relative(root, file), ...r });
  const b = r.bots;
  console.log(`\n${path.relative(root, file)}  "${r.name}"  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`  ${level.boards.length} boards, ${r.pixels} pixels, ${r.containers} containers, ${level.lanes.length} lanes, ${level.deckSlots} slots`);
  console.log(`  winnable: ${r.solver.result === 'win' ? `yes (${r.solver.moves.length} moves)` : r.solver.result === 'impossible' ? 'NO' : 'unknown (search budget ran out)'}`);
  console.log(`  difficulty (average bot win rate): ${pct(r.difficulty)}`);
  console.log(`  win rate   careless ${pct(b.careless.winRate)}   average ${pct(b.average.winRate)}   careful ${pct(b.careful.winRate)}`);
  console.log(`  average bot: ~${Math.round(b.average.moves)} moves, ~${Math.round(b.average.seconds)}s, tightest deck ${b.average.tightestDeck.toFixed(1)} free, ${b.average.parkedPerRun.toFixed(1)} parked sends/run` +
    (b.average.mostParked.length ? ` (most: ${b.average.mostParked.map(([c, n]) => `${c} ${n.toFixed(1)}`).join(', ')})` : ''));
  if (b.average.winRate < 1) console.log(`  average bot losses leave ${pct(b.average.leftOnLoss)} of pixels standing`);
  for (const e of r.errors) console.log(`  ERROR    ${e}`);
  for (const item of r.lint) if (item.level === 'warning' || verbose) console.log(`  ${item.level === 'warning' ? 'WARNING' : 'note   '}  [${item.rule}] ${item.message}`);
}
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(reports, null, 2));
  console.log(`\nWrote ${jsonOut}`);
}
