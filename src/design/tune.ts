import type { ColorKey } from '../shared/types';
import type { Picture } from '../art/library';
import { validateLevel, type ContainerData, type LevelData } from '../game/level';
import { lintLevel } from '../rules/lint';
import { playLevel, seededRng } from '../rules/bots';
import { solveLevel } from '../rules/solver';
import { reportLevel, type LevelReport } from '../rules/report';
import { buildLevel, pixelsByColor, type LevelBrief } from './brief';

/**
 * Adjusts a brief's queue until the level's difficulty score lands in the brief's target
 * band, with no rule warnings and a winnable, fair level. It changes only the queue: the
 * order of containers, how each color is split, and where links and hidden containers
 * sit. Boards stay exactly as the brief describes them.
 */

export interface TuneStep {
  evaluation: number;
  change: string;
  difficulty: number;
  warnings: number;
  winnable: boolean;
  loss: number;
  accepted: boolean;
}

export interface TuneResult {
  level: LevelData;
  report: LevelReport;
  status: 'in-band' | 'closest';
  message: string;
  steps: TuneStep[];
  startDifficulty: number;
}

export interface TuneOptions {
  maxEvaluations?: number;
  /** Average-bot runs per candidate during the search. */
  searchRuns?: number;
  /** Runs for the final report. */
  verifyRuns?: number;
  seed?: number;
  /** The careful bot must win at least this often, so the difficulty is not a trap. */
  minCareful?: number;
  onStep?: (step: TuneStep) => void;
}

interface Evaluation {
  loss: number;
  difficulty: number;
  warnings: number;
  winnable: boolean;
}

/**
 * The band the search aims at: the middle 60% of the brief's band. The search stops as
 * soon as its loss reaches zero, so aiming at the whole band would accept whatever the
 * first pass happened to produce — a level given 80–95% would sit at 94% and be no easier
 * than the level before it. Aiming at the core leaves room on both sides, and the final
 * check still accepts the brief's full band.
 */
function searchBand({ min, max }: { min: number; max: number }) {
  const margin = (max - min) * 0.2;
  return { min: min + margin, max: max - margin };
}

function evaluate(level: LevelData, brief: LevelBrief, target: { min: number; max: number }, pictures: Map<string, Picture>, runs: number, seed: number): Evaluation {
  if (validateLevel(level, pictures).length) return { loss: 100, difficulty: 0, warnings: 0, winnable: false };
  const allowed = new Set(brief.queue?.allowWarnings ?? []);
  const warnings = lintLevel(level).filter((w) => w.level === 'warning' && !allowed.has(w.rule)).length;
  const solved = solveLevel(level, 15000).result;
  const rng = seededRng(seed);
  let wins = 0;
  for (let i = 0; i < runs; i++) if (playLevel(level, 'average', rng).result === 'win') wins++;
  const difficulty = wins / runs;
  const { min, max } = target;
  const outside = difficulty < min ? min - difficulty : difficulty > max ? difficulty - max : 0;
  const loss = outside * 10 + warnings * 2 + (solved === 'win' ? 0 : solved === 'unknown' ? 3 : 20);
  return { loss, difficulty, warnings, winnable: solved === 'win' };
}

const cloneLanes = (lanes: ContainerData[][]) => lanes.map((l) => l.map((c) => ({ ...c })));

/** One random change to the queue. Returns a description, or null if nothing applied. */
function mutate(lanes: ContainerData[][], brief: LevelBrief, pixels: Map<ColorKey, number>, rng: () => number): string | null {
  const positions = lanes.flatMap((l, k) => l.map((_, j) => [k, j] as const));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const roll = rng();
  if (roll < 0.35) {
    const [k1, j1] = pick(positions), [k2, j2] = pick(positions);
    if (k1 === k2 && j1 === j2) return null;
    [lanes[k1][j1], lanes[k2][j2]] = [lanes[k2][j2], lanes[k1][j1]];
    return `swap ${lanes[k2][j2].color} and ${lanes[k1][j1].color}`;
  }
  if (roll < 0.6) {
    const [k, j] = pick(positions);
    const step = rng() < 0.5 ? -1 : 1;
    const to = j + step;
    if (to < 0 || to >= lanes[k].length) return null;
    [lanes[k][j], lanes[k][to]] = [lanes[k][to], lanes[k][j]];
    return `move ${lanes[k][to].color} ${step < 0 ? 'earlier' : 'later'} in lane ${k}`;
  }
  if (roll < 0.75) {
    const [k, j] = pick(positions);
    const t = Math.floor(rng() * lanes.length);
    if (t === k) return null;
    // Keep lanes roughly even: every lane within 2 of the average length.
    const average = positions.length / lanes.length;
    if (lanes[k].length - 1 < average - 2 || lanes[t].length + 1 > average + 2) return null;
    const [c] = lanes[k].splice(j, 1);
    lanes[t].splice(Math.floor(rng() * (lanes[t].length + 1)), 0, c);
    return `move a ${c.color} container to another lane`;
  }
  if (roll < 0.85) {
    // Re-split a color into one more or one fewer container.
    const colors = [...pixels.keys()];
    const color = pick(colors);
    const n = pixels.get(color)!;
    const max = brief.containers?.maxCharges ?? 40;
    const current = positions.filter(([k, j]) => lanes[k][j].color === color);
    const count = current.length + (rng() < 0.5 ? -1 : 1);
    if (count < Math.ceil(n / max) || count > Math.floor(n / 3) || count < 1) return null;
    if (count < current.length) {
      const [k, j] = pick(current);
      if (lanes[k][j].link || lanes[k].length <= 1) return null;
      lanes[k].splice(j, 1);
    } else {
      const target = pick(lanes);
      target.splice(1 + Math.floor(rng() * target.length), 0, { color, charges: 0 });
    }
    const all = lanes.flat().filter((c) => c.color === color);
    all.forEach((c, i) => { c.charges = Math.floor(n / all.length) + (i < n % all.length ? 1 : 0); });
    return `split ${color} into ${all.length}`;
  }
  if (roll < 0.93 && (brief.queue?.links ?? 0) > 0) {
    const linked = positions.filter(([k, j]) => lanes[k][j].link);
    if (!linked.length) return null;
    const id = lanes[linked[0][0]][linked[0][1]].link!;
    const free = positions.filter(([k, j]) => j > 0 && !lanes[k][j].link);
    const [k1, j1] = pick(free);
    const partners = free.filter(([k, j]) => k !== k1 && Math.abs(j - j1) <= 1);
    if (!partners.length) return null;
    const [k2, j2] = pick(partners);
    for (const [k, j] of linked) if (lanes[k][j].link === id) delete lanes[k][j].link;
    lanes[k1][j1].link = id;
    lanes[k2][j2].link = id;
    return `move link ${id}`;
  }
  if ((brief.queue?.hidden ?? 0) > 0) {
    const hidden = positions.filter(([k, j]) => lanes[k][j].hidden);
    const spots = positions.filter(([k, j]) => j > 0 && !lanes[k][j].hidden && !lanes[k][j - 1]?.hidden && !lanes[k][j + 1]?.hidden);
    if (!hidden.length || !spots.length) return null;
    const [hk, hj] = pick(hidden), [sk, sj] = pick(spots);
    delete lanes[hk][hj].hidden;
    lanes[sk][sj].hidden = true;
    return `move a hidden container`;
  }
  return null;
}

export function tuneLevel(brief: LevelBrief, pictures: Map<string, Picture>, options: TuneOptions = {}): TuneResult {
  const maxEvaluations = options.maxEvaluations ?? 150;
  const searchRuns = options.searchRuns ?? 40;
  const seed = options.seed ?? 7;
  const minCareful = options.minCareful ?? 0.6;
  const built = buildLevel(brief, pictures);
  const base = built.level;
  const pixels = pixelsByColor(base.boards);
  const rng = seededRng(seed * 31 + 1);
  const steps: TuneStep[] = [];
  const withLanes = (lanes: ContainerData[][]): LevelData => ({ ...base, lanes });

  let current = cloneLanes(base.lanes);
  const aim = searchBand(brief.target);
  let currentEval = evaluate(withLanes(current), brief, aim, pictures, searchRuns, seed);
  const startDifficulty = currentEval.difficulty;
  let best = { lanes: cloneLanes(current), evaluation: currentEval };
  const rejected = new Set<string>();

  for (let e = 1; e <= maxEvaluations; e++) {
    if (best.evaluation.loss === 0) {
      // Confirm with more runs and the fairness check before stopping.
      const report = reportLevel(withLanes(best.lanes), pictures, { runs: { careless: 100, average: options.verifyRuns ?? 200, careful: 30 } });
      const inBand = report.difficulty >= brief.target.min && report.difficulty <= brief.target.max;
      const fair = report.bots.careful.winRate >= minCareful;
      if (inBand && fair && report.solver.result === 'win') {
        return { level: withLanes(best.lanes), report, status: 'in-band', message: `In the target band after ${e - 1} candidates.`, steps, startDifficulty };
      }
      const key = JSON.stringify(best.lanes);
      rejected.add(key);
      best.evaluation = { ...best.evaluation, loss: (inBand ? 0 : 1) + (fair ? 0 : 1.5) + 0.5 };
      currentEval = best.evaluation;
    }
    const candidate = cloneLanes(current);
    const change = mutate(candidate, brief, pixels, rng);
    if (!change || rejected.has(JSON.stringify(candidate))) continue;
    const evaluation = evaluate(withLanes(candidate), brief, aim, pictures, searchRuns, seed);
    const temperature = 0.4 * (1 - e / maxEvaluations) + 0.02;
    const accepted = evaluation.loss <= currentEval.loss || rng() < Math.exp(-(evaluation.loss - currentEval.loss) / temperature);
    const step = { evaluation: e, change, difficulty: evaluation.difficulty, warnings: evaluation.warnings, winnable: evaluation.winnable, loss: evaluation.loss, accepted };
    steps.push(step);
    options.onStep?.(step);
    if (accepted) {
      current = candidate;
      currentEval = evaluation;
      if (evaluation.loss < best.evaluation.loss) best = { lanes: cloneLanes(candidate), evaluation };
    }
  }

  const level = withLanes(best.lanes);
  const report = reportLevel(level, pictures, { runs: { careless: 100, average: options.verifyRuns ?? 200, careful: 30 } });
  const inBand = report.difficulty >= brief.target.min && report.difficulty <= brief.target.max;
  const reasons: string[] = [];
  if (!inBand) reasons.push(`difficulty ${Math.round(report.difficulty * 100)}% is outside ${Math.round(brief.target.min * 100)}–${Math.round(brief.target.max * 100)}%`);
  const warnings = report.lint.filter((w) => w.level === 'warning' && !(brief.queue?.allowWarnings ?? []).includes(w.rule));
  if (warnings.length) reasons.push(`${warnings.length} rule warning${warnings.length === 1 ? '' : 's'}`);
  if (report.solver.result !== 'win') reasons.push('no winning line found');
  if (report.bots.careful.winRate < minCareful) reasons.push(`the careful bot only wins ${Math.round(report.bots.careful.winRate * 100)}%, so the difficulty may be a trap`);
  const status = reasons.length ? 'closest' : 'in-band';
  return {
    level, report, status, steps, startDifficulty,
    message: status === 'in-band' ? `In the target band after ${maxEvaluations} candidates.`
      : `Closest found after ${maxEvaluations} candidates: ${reasons.join('; ')}. The queue alone may not reach this target; change the boards, colors or features in the brief.`,
  };
}
