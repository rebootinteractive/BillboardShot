import type { LevelData } from '../game/level';

/**
 * A level file in the repository's layout: one art row and one container per line, so
 * diffs between versions of a level stay readable.
 */
export function formatLevel(level: LevelData): string {
  const j = JSON.stringify;
  const inline = (value: unknown) => j(value).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\{/g, '{ ').replace(/\}/g, ' }').replace(/,\{/g, ', {');
  const boards = level.boards.map((b) => {
    const lines = [`      "name": ${j(b.name)}`, `      "art": [\n${b.art.map((r) => `        ${j(r)}`).join(',\n')}\n      ]`];
    if (b.source) lines.push(`      "source": ${inline(b.source)}`);
    if (b.keys) lines.push(`      "keys": [${b.keys.map((k) => inline(k)).join(', ')}]`);
    if (b.lock) lines.push(`      "lock": ${inline(b.lock)}`);
    return `    {\n${lines.join(',\n')}\n    }`;
  }).join(',\n');
  const lanes = level.lanes.map((lane) => `    [\n${lane.map((c) => {
    let s = `      { "color": ${j(c.color)}, "charges": ${c.charges}`;
    if (c.hidden) s += ', "hidden": true';
    if (c.link) s += `, "link": ${j(c.link)}`;
    return `${s} }`;
  }).join(',\n')}\n    ]`).join(',\n');
  const head = [`  "name": ${j(level.name)}`];
  if (level.hint) head.push(`  "hint": ${j(level.hint)}`);
  if (level.tutorial) head.push(`  "tutorial": ${j(level.tutorial)}`);
  if (level.label) head.push(`  "label": ${j(level.label)}`);
  if (level.cellSize !== undefined) head.push(`  "cellSize": ${level.cellSize}`);
  return `{\n${head.join(',\n')},\n  "boards": [\n${boards}\n  ],\n  "lanes": [\n${lanes}\n  ]\n}\n`;
}
