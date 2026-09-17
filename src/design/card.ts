import { COLOR_CSS } from '../shared/colors';
import { artColor, isMysteryChar, type LevelData } from '../game/level';
import type { LevelReport } from '../rules/report';
import type { LevelBrief } from './brief';
import type { TuneResult } from './tune';

const KEY_CSS: Record<string, string> = { gold: '#f5b82e', silver: '#aab7c4', bronze: '#c8783f' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const pct = (x: number) => `${Math.round(x * 100)}%`;

function boardHtml(b: LevelData['boards'][number]): string {
  const width = b.art[0].length;
  const keys = new Map((b.keys ?? []).map((k) => [`${k.col},${k.row}`, k.color]));
  const cells = b.art.flatMap((line, row) => [...line].map((ch, col) => {
    const color = artColor(ch);
    if (!color) return '<i></i>';
    const key = keys.get(`${col},${row}`);
    const style = isMysteryChar(ch) ? 'background:#b3bac3' : `background:${COLOR_CSS[color]}`;
    return `<i class="px${key ? ' key' : ''}" style="${style}${key ? `;outline-color:${KEY_CSS[key]}` : ''}">${isMysteryChar(ch) ? '?' : ''}</i>`;
  })).join('');
  const lock = b.lock ? (b.lock.type === 'key'
    ? `<span class="badge" style="background:${KEY_CSS[b.lock.color]}">locked · ${b.lock.color} key</span>`
    : `<span class="badge ice">frozen · ${b.lock.count} ${b.lock.color}</span>`) : '';
  const odd = b.source?.overrides?.length ? `<span class="badge">${b.source.overrides.length} odd pixel${b.source.overrides.length === 1 ? '' : 's'}</span>` : '';
  return `<figure><div class="art" style="grid-template-columns:repeat(${width},10px)">${cells}</div><figcaption>${esc(b.name)} ${lock}${odd}</figcaption></figure>`;
}

function queueHtml(level: LevelData): string {
  return level.lanes.map((lane, k) => `<div class="lane"><div class="lane-title">Lane ${k + 1}</div>${lane.map((c) =>
    `<div class="chip" style="background:${COLOR_CSS[c.color]}"><b>${c.charges}</b>${c.hidden ? '<span>hidden</span>' : ''}${c.link ? `<span>link ${esc(c.link)}</span>` : ''}</div>`,
  ).join('')}</div>`).join('');
}

/** A self-contained HTML page for reviewing one level. */
export function reportCard(level: LevelData, report: LevelReport, options: { brief?: LevelBrief; tuning?: TuneResult; playUrl?: string } = {}): string {
  const { brief, tuning, playUrl } = options;
  const b = report.bots;
  const inBand = brief ? report.difficulty >= brief.target.min && report.difficulty <= brief.target.max : null;
  const warnings = report.lint.filter((i) => i.level === 'warning');
  const notes = report.lint.filter((i) => i.level === 'note');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(level.name)}</title>
<style>
  :root { --bg:#f3f4f6; --card:#fff; --ink:#2f3140; --muted:#6b7280; --line:#e5e7eb; --good:#23864a; --bad:#b8233f; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#16181d; --card:#1f2229; --ink:#e7e9ee; --muted:#9aa1ad; --line:#2d313a; --good:#5bd08a; --bad:#ff7b8f; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.45 -apple-system, Helvetica, Arial, sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:24px 16px 48px; }
  h1 { margin:0; font-size:26px; } h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:28px 0 10px; }
  .sub { color:var(--muted); margin:4px 0 0; }
  .intent { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-top:14px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px 12px; }
  .stat b { display:block; font-size:22px; } .stat span { color:var(--muted); font-size:12px; }
  .good { color:var(--good); } .bad { color:var(--bad); }
  .boards { display:flex; flex-wrap:wrap; gap:14px; }
  figure { margin:0; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px; }
  figcaption { margin-top:8px; font-size:13px; }
  .art { display:grid; gap:1px; }
  .art i { width:10px; height:10px; border-radius:2px; font-style:normal; font-size:7px; line-height:10px; text-align:center; color:#fff; }
  .art i.key { outline:2px solid; outline-offset:0; z-index:1; }
  .badge { display:inline-block; font-size:11px; padding:1px 7px; border-radius:999px; background:var(--line); color:#2f3140; margin-left:4px; }
  .badge.ice { background:#d6f1ff; }
  .queue { display:flex; gap:12px; flex-wrap:wrap; }
  .lane { display:flex; flex-direction:column; gap:4px; min-width:92px; }
  .lane-title { font-size:12px; color:var(--muted); }
  .chip { border-radius:8px; padding:4px 8px; color:#1d1f27; font-size:12px; display:flex; gap:6px; align-items:center; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08); }
  .chip span { background:rgba(255,255,255,.7); border-radius:6px; padding:0 5px; font-size:10px; }
  ul { margin:0; padding-left:18px; } li { margin:3px 0; }
  a.play { display:inline-block; margin-top:12px; background:var(--ink); color:var(--bg); padding:8px 14px; border-radius:10px; text-decoration:none; }
</style></head><body><main>
<h1>${esc(level.name)}</h1>
<p class="sub">version ${report.version} · ${level.boards.length} boards · ${report.pixels} pixels · ${report.containers} containers · ${level.lanes.length} lanes</p>
${brief ? `<div class="intent">${esc(brief.intent)}</div>` : ''}
${playUrl ? `<a class="play" href="${esc(playUrl)}">Play this level</a>` : ''}

<h2>Difficulty</h2>
<div class="stats">
  <div class="stat"><b class="${inBand === null ? '' : inBand ? 'good' : 'bad'}">${pct(report.difficulty)}</b><span>difficulty score (average bot)${brief ? ` · target ${pct(brief.target.min)}–${pct(brief.target.max)}` : ''}</span></div>
  <div class="stat"><b>${pct(b.careless.winRate)}</b><span>careless bot</span></div>
  <div class="stat"><b>${pct(b.careful.winRate)}</b><span>careful bot</span></div>
  <div class="stat"><b class="${report.solver.result === 'win' ? 'good' : 'bad'}">${report.solver.result === 'win' ? 'yes' : report.solver.result === 'impossible' ? 'no' : 'unknown'}</b><span>winnable${report.solver.result === 'win' ? ` · ${report.solver.moves.length} moves` : ''}</span></div>
  <div class="stat"><b>~${Math.round(b.average.seconds)}s</b><span>rough play time</span></div>
  <div class="stat"><b>${b.average.tightestDeck.toFixed(1)}</b><span>free slots at the tightest moment</span></div>
</div>
${tuning ? `<p class="sub">Tuner: ${esc(tuning.message)} Started at ${pct(tuning.startDifficulty)}.</p>` : ''}
${b.average.mostParked.length ? `<p class="sub">Most often sent with nothing to pull: ${b.average.mostParked.map(([c, n]) => `${c} (${n.toFixed(1)} per run)`).join(', ')}.</p>` : ''}

<h2>Boards</h2>
<div class="boards">${level.boards.map(boardHtml).join('')}</div>

<h2>Queue (front of each lane at the top)</h2>
<div class="queue">${queueHtml(level)}</div>

<h2>Warnings</h2>
${warnings.length || report.errors.length ? `<ul>${[...report.errors.map((e) => `<li class="bad">ERROR: ${esc(e)}</li>`), ...warnings.map((w) => `<li class="bad">[${esc(w.rule)}] ${esc(w.message)}</li>`)].join('')}</ul>` : '<p class="sub">None.</p>'}
<h2>Notes</h2>
${notes.length ? `<ul>${notes.map((w) => `<li>[${esc(w.rule)}] ${esc(w.message)}</li>`).join('')}</ul>` : '<p class="sub">None.</p>'}
</main></body></html>
`;
}
