#!/usr/bin/env node
/**
 * The level designer's command line. See docs/level-designer-workflow.md.
 *
 *   npm run level -- facts <picture id...>     groups, colors, pixels, exposure, mystery candidates
 *   npm run level -- build <brief.json>        build without tuning; write level + report card
 *   npm run level -- tune <brief.json>         build and tune to the target; write level + report card
 *   npm run level -- report <level.json>       report card for an existing level
 *
 * Levels go to src/levels/trial/, report cards to design/reports/.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [command, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(rest.splice(i, 2)[1]);
};
const evaluations = flag('evaluations', 150);
const args = rest;

const outfile = path.join(root, 'node_modules/.cache/billboardshot-sim/design.mjs');
await build({ entryPoints: [path.join(root, 'src/design/index.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
const d = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);

const pictureDir = path.join(root, 'src/art/pictures');
const pictures = new Map(fs.readdirSync(pictureDir).map((f) => JSON.parse(fs.readFileSync(path.join(pictureDir, f), 'utf8'))).map((p) => [p.id, p]));
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
const pct = (x) => `${Math.round(x * 100)}%`;

function writeOutputs(id, level, report, extra = {}) {
  const levelFile = path.join(root, 'src/levels/trial', `${id}.json`);
  const cardFile = path.join(root, 'design/reports', `${id}.html`);
  fs.mkdirSync(path.dirname(levelFile), { recursive: true });
  fs.mkdirSync(path.dirname(cardFile), { recursive: true });
  fs.writeFileSync(levelFile, d.formatLevel(level));
  fs.writeFileSync(cardFile, d.reportCard(level, report, { ...extra, playUrl: `http://localhost:5173/?debug&sandbox=trial/${id}` }));
  writeIndex();
  console.log(`  level:       ${path.relative(root, levelFile)}`);
  console.log(`  report card: ${path.relative(root, cardFile)}`);
  console.log(`  play:        http://localhost:5173/?debug&sandbox=trial/${id}`);
}

/** design/reports/index.html: every report card, with its difficulty and target. */
function writeIndex() {
  const dir = path.join(root, 'design/reports');
  const cards = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html').sort();
  const rows = cards.map((f) => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? f;
    const score = html.match(/<b class="[^"]*">(\d+%)<\/b><span>difficulty score[^<]*<\/span>/);
    const target = html.match(/target (\d+%–\d+%)/)?.[1] ?? '';
    const inBand = html.match(/<b class="(good|bad)">\d+%<\/b><span>difficulty score/)?.[1];
    return `<li><a href="${f}">${title}</a> <span class="${inBand ?? ''}">${score?.[1] ?? ''}</span> <small>${target ? `target ${target}` : ''}</small></li>`;
  }).join('\n');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Level report cards</title>
<style>body{font:16px/1.5 -apple-system,Helvetica,Arial,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#2f3140;background:#f3f4f6}
li{margin:6px 0}small{color:#6b7280}.good{color:#23864a}.bad{color:#b8233f}
@media (prefers-color-scheme: dark){body{background:#16181d;color:#e7e9ee}small{color:#9aa1ad}.good{color:#5bd08a}.bad{color:#ff7b8f}}</style></head>
<body><h1>Level report cards</h1><ul>${rows}</ul></body></html>\n`);
}

function summarize(report, brief) {
  const b = report.bots;
  const band = brief ? ` (target ${pct(brief.target.min)}–${pct(brief.target.max)})` : '';
  console.log(`  difficulty ${pct(report.difficulty)}${band} · careless ${pct(b.careless.winRate)} · careful ${pct(b.careful.winRate)} · winnable ${report.solver.result} · ~${Math.round(b.average.seconds)}s`);
  for (const e of report.errors) console.log(`  ERROR    ${e}`);
  for (const w of report.lint.filter((i) => i.level === 'warning')) console.log(`  WARNING  [${w.rule}] ${w.message}`);
}

if (command === 'facts') {
  for (const id of args) {
    const p = pictures.get(id);
    if (!p) { console.log(`${id}: not in the library`); continue; }
    const f = d.analyzePicture(p);
    console.log(`\n${p.id} "${p.name}"  ${f.width}×${f.height}, ${f.pixels} pixels  [${p.tags.join(', ')}]`);
    for (const g of f.groups) {
      const def = p.groups[g.id];
      console.log(`  group ${g.id} ${def.part.padEnd(16)} ${String(g.pixels).padStart(4)} px  ${g.pieces} piece${g.pieces === 1 ? ' ' : 's'}  ` +
        `${g.exposedPixels ? `exposed ${g.exposedPixels}`.padEnd(11) : 'buried'.padEnd(11)} rests on ${g.restsOn.join(',') || '–'}  ` +
        `${g.mysteryCandidate ? 'mystery ok' : ''}  suggest ${def.suggest.join('/')}`);
    }
  }
} else if (command === 'build' || command === 'tune') {
  const brief = readJson(args[0]);
  console.log(`\n${brief.id} "${brief.name}"`);
  if (command === 'build') {
    const { level, errors } = d.buildLevel(brief, pictures);
    if (errors.length) { for (const e of errors) console.log(`  ERROR    ${e}`); process.exit(1); }
    const report = d.reportLevel(level, pictures, { runs: { careless: 100, average: 200, careful: 30 } });
    summarize(report, brief);
    writeOutputs(brief.id, level, report, { brief });
  } else {
    const { errors } = d.buildLevel(brief, pictures);
    if (errors.length) { for (const e of errors) console.log(`  ERROR    ${e}`); process.exit(1); }
    let last = Date.now();
    const result = d.tuneLevel(brief, pictures, {
      maxEvaluations: evaluations,
      onStep: (s) => {
        if (Date.now() - last > 4000 || s.loss === 0) {
          last = Date.now();
          console.log(`  #${String(s.evaluation).padStart(3)} ${s.accepted ? 'kept   ' : 'dropped'} difficulty ${pct(s.difficulty)}${s.warnings ? `, ${s.warnings} warning(s)` : ''}${s.winnable ? '' : ', not proven winnable'} · ${s.change}`);
        }
      },
    });
    console.log(`  ${result.message}`);
    summarize(result.report, brief);
    writeOutputs(brief.id, result.level, result.report, { brief, tuning: result });
  }
} else if (command === 'report') {
  const file = path.resolve(args[0]);
  const level = readJson(file);
  const report = d.reportLevel(level, pictures, { runs: { careless: 100, average: 200, careful: 30 } });
  const id = path.basename(file, '.json');
  const cardFile = path.join(root, 'design/reports', `${id}.html`);
  fs.mkdirSync(path.dirname(cardFile), { recursive: true });
  fs.writeFileSync(cardFile, d.reportCard(level, report));
  summarize(report);
  console.log(`  report card: ${path.relative(root, cardFile)}`);
} else {
  console.log('Usage: npm run level -- facts <picture...> | build <brief.json> | tune <brief.json> [--evaluations N] | report <level.json>');
}
