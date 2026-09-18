#!/usr/bin/env node
/**
 * The art library's command line.
 *
 *   npm run art -- check [id...]    validate pictures; every error, as a sentence
 *   npm run art -- show <id...>     ASCII preview and group facts
 *   npm run art -- stats            what the library holds: sizes, pixels, tags, status
 *
 * New pictures usually start from scripts/emoji.py, which turns a Fluent Emoji into a
 * grid; see docs/level-design-strategy.md, section 3.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [command, ...args] = process.argv.slice(2);

const outfile = path.join(root, 'node_modules/.cache/billboardshot-sim/art.mjs');
await build({ entryPoints: [path.join(root, 'src/art/index.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
const a = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);

const dir = path.join(root, 'src/art/pictures');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const load = (f) => ({ file: f, picture: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) });
const all = files.map(load);
const pixels = (art) => art.reduce((n, row) => n + [...row].filter((ch) => ch !== '.').length, 0);
const chosen = (ids) => (ids.length ? all.filter(({ picture }) => ids.includes(picture.id)) : all);

function check(ids) {
  const picked = chosen(ids);
  const missing = ids.filter((id) => !picked.some(({ picture }) => picture.id === id));
  let bad = 0;
  for (const { file, picture } of picked) {
    const errors = a.validatePicture(picture, file.replace(/\.json$/, ''));
    if (!errors.length) continue;
    bad++;
    console.log(`\n${file}`);
    for (const e of errors) console.log(`  - ${e}`);
  }
  for (const id of missing) console.log(`\n${id}: no such picture in the library.`);
  const ok = picked.length - bad;
  console.log(`\n${ok}/${picked.length} valid${bad ? `, ${bad} with errors` : ''}.`);
  if (bad || missing.length) process.exitCode = 1;
}

function show(ids) {
  for (const { picture } of chosen(ids)) {
    const facts = a.analyzePicture(picture);
    console.log(`\n${picture.id}  "${picture.name}"  ${facts.width}x${facts.height}, ${facts.pixels} pixels, ${picture.status}  [${picture.tags.join(', ')}]`);
    for (const row of picture.art) console.log(`  ${row.replace(/\./g, '·')}`);
    for (const g of facts.groups) {
      const notes = [`${g.pixels}px`, `${g.pieces} piece${g.pieces === 1 ? '' : 's'}`];
      if (g.exposedPixels) notes.push(`${g.exposedPixels} exposed`);
      if (g.restsOn.length) notes.push(`rests on ${g.restsOn.join(',')}`);
      if (g.mysteryCandidate) notes.push('mystery ok');
      console.log(`  ${g.id} ${g.part.padEnd(14)} ${notes.join(' · ')}  suggest ${picture.groups[g.id].suggest.join('/')}`);
    }
  }
}

function stats() {
  const by = (fn) => all.reduce((m, x) => m.set(fn(x), (m.get(fn(x)) ?? 0) + 1), new Map());
  const bar = (m, label) => {
    console.log(`\n${label}`);
    for (const k of [...m.keys()].sort((x, y) => (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))))) {
      console.log(`  ${String(k).padStart(8)}  ${'#'.repeat(m.get(k))} ${m.get(k)}`);
    }
  };
  console.log(`${all.length} pictures`);
  bar(by(({ picture }) => picture.status), 'status');
  bar(by(({ picture }) => `${Math.floor(pixels(picture.art) / 40) * 40}-${Math.floor(pixels(picture.art) / 40) * 40 + 39}`), 'pixels');
  bar(by(({ picture }) => `${picture.art[0].length}x${picture.art.length}`), 'size');
  bar(by(({ picture }) => Object.keys(picture.groups).length), 'groups');
  const tags = new Map();
  for (const { picture } of all) for (const t of picture.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  bar(tags, 'tags');
}

if (command === 'check') check(args);
else if (command === 'show') show(args);
else if (command === 'stats') stats();
else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].split('\n').slice(2).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
  process.exitCode = 1;
}
