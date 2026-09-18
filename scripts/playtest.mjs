#!/usr/bin/env node
/**
 * Playtest analysis:
 *
 *   npm run playtest                     every results file in playtest/
 *   npm run playtest -- a.txt b.csv      specific files (one player per file)
 *   npm run playtest -- --runs 100       bot runs per level for the comparison
 *
 * Reads the exports from the in-game "Send results" button, groups attempts by level
 * version, and puts what people did next to what the simulator predicts for that version.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const runsAt = args.indexOf('--runs');
const runs = runsAt >= 0 ? Number(args.splice(runsAt, 2)[1]) : 100;
const dir = path.join(root, 'playtest');
const files = args.length ? args.map((f) => path.resolve(f)) : fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).map((f) => path.join(dir, f)) : [];
if (!files.length) {
  console.log('No results files. Put exports in playtest/ or pass file paths.');
  process.exit(0);
}

// ---- read exports
const attempts = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.startsWith('level,file'));
  if (headerAt < 0) { console.warn(`Skipping ${path.basename(file)}: no results header.`); continue; }
  const header = lines[headerAt].split(',');
  const player = path.basename(file).replace(/\.[a-z]+$/i, '');
  for (const line of lines.slice(headerAt + 1)) {
    if (!/^\d+,/.test(line)) continue;
    const cells = line.split(',');
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    attempts.push({
      player, level: Number(row.level), file: row.file, version: row.version || 'unversioned', result: row.result,
      seconds: Number(row.seconds), idleSeconds: Number(row.idleSeconds ?? 0), sends: Number(row.sends),
      boardChanges: Number(row.boardChanges), pixelsLeft: Number(row.pixelsLeft), pixelsTotal: Number(row.pixelsTotal),
      startedAt: row.startedAt,
    });
  }
}
// Still in progress, or left before sending anything: not a real attempt.
const real = attempts.filter((a) => a.result !== 'playing' && !(a.result === 'abandoned' && a.sends === 0) && a.level > 0);
const dropped = attempts.length - real.length;

// ---- current level versions and simulator predictions
const outfile = path.join(root, 'node_modules/.cache/billboardshot-sim/rules.mjs');
await build({ entryPoints: [path.join(root, 'src/rules/index.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
const rules = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
const pictureDir = path.join(root, 'src/art/pictures');
const pictures = new Map(fs.readdirSync(pictureDir).map((f) => JSON.parse(fs.readFileSync(path.join(pictureDir, f), 'utf8'))).map((p) => [p.id, p]));
const current = new Map();
for (const f of fs.readdirSync(path.join(root, 'src/levels/mvp')).filter((f) => f.endsWith('.json'))) {
  const level = JSON.parse(fs.readFileSync(path.join(root, 'src/levels/mvp', f), 'utf8'));
  current.set(f, { level, version: rules.levelVersion(level) });
}

// Exports made before results carried a version were all played on the first playtest
// deploy. Give them the version each level file had in that commit.
const LEGACY_COMMIT = '963432d';
const legacyVersions = new Map();
for (const a of real) {
  if (a.version !== 'unversioned' || legacyVersions.has(a.file)) continue;
  try {
    const text = execSync(`git show ${LEGACY_COMMIT}:src/levels/${a.file}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    legacyVersions.set(a.file, rules.levelVersion(JSON.parse(text)));
  } catch {
    legacyVersions.set(a.file, 'unversioned');
  }
}
for (const a of real) if (a.version === 'unversioned') a.version = legacyVersions.get(a.file);

// ---- per level version
const groups = new Map();
for (const a of real) {
  const key = `${a.file}|${a.version}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(a);
}
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, z) => a - z);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (x) => (x === null ? '  –' : `${Math.round(x * 100)}%`.padStart(4));

const rows = [];
for (const [key, list] of [...groups].sort((a, z) => a[1][0].level - z[1][0].level || a[0].localeCompare(z[0]))) {
  const [file, version] = key.split('|');
  const byPlayer = new Map();
  for (const a of list.sort((x, y) => x.startedAt.localeCompare(y.startedAt))) {
    if (!byPlayer.has(a.player)) byPlayer.set(a.player, []);
    byPlayer.get(a.player).push(a);
  }
  const players = [...byPlayer.values()];
  const firstTry = players.filter((p) => p[0].result === 'win').length / players.length;
  const winners = players.filter((p) => p.some((a) => a.result === 'win'));
  const attemptsToWin = winners.map((p) => p.findIndex((a) => a.result === 'win') + 1);
  const winTimes = winners.map((p) => p.find((a) => a.result === 'win').seconds);
  const losses = list.filter((a) => a.result !== 'win');
  const cur = current.get(file);
  const isCurrent = cur && cur.version === version;
  let sim = null;
  if (isCurrent) {
    const r = rules.reportLevel(cur.level, pictures, { runs: { careless: runs, average: runs, careful: Math.max(10, Math.round(runs / 5)) } });
    sim = { average: r.bots.average.winRate, careless: r.bots.careless.winRate, seconds: r.bots.average.seconds };
  }
  rows.push({ level: list[0].level, file, version, isCurrent, players: players.length, firstTry, attemptsToWin: median(attemptsToWin), neverWon: players.length - winners.length, winSeconds: median(winTimes), lossLeft: losses.length ? median(losses.map((a) => a.pixelsLeft / a.pixelsTotal)) : null, boardChanges: median(winners.map((p) => p.find((a) => a.result === 'win').boardChanges)), sim });
}

const playersCount = new Set(real.map((a) => a.player)).size;
console.log(`\n${playersCount} player${playersCount === 1 ? '' : 's'}, ${real.length} attempts (${dropped} dropped: unfinished, or left before sending anything)\n`);
console.log('level  version       players  first-try  attempts  never   win time  board   |  bot avg  careless  bot time');
console.log('                                win        to win    won     (median)  changes |');
for (const r of rows) {
  const tag = `${String(r.level).padStart(2)} ${r.file.replace('.json', '').replace('level-', '#')}`;
  const version = `${r.version}${r.isCurrent ? '' : ' (old)'}`.padEnd(15);
  const sim = r.sim ? `${pct(r.sim.average)}     ${pct(r.sim.careless)}     ~${Math.round(r.sim.seconds)}s` : '  (not the current version)';
  console.log(`${tag.padEnd(7)}${version}${String(r.players).padStart(4)}     ${pct(r.firstTry)}      ${r.attemptsToWin === null ? '  –' : String(r.attemptsToWin).padStart(3)}      ${String(r.neverWon).padStart(3)}    ${r.winSeconds === null ? '   –' : `${Math.round(r.winSeconds)}s`.padStart(5)}    ${r.boardChanges === null ? '  –' : String(r.boardChanges).padStart(3)}    |  ${sim}`);
}
console.log('\nOnly results for a level\'s current version are compared with the simulator. "Win time" is engaged time for the winning attempt.');
