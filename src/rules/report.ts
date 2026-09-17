import type { Picture } from '../art/library';
import { levelVersion, validateLevel, type LevelData } from '../game/level';
import { playLevel, seededRng, type BotName } from './bots';
import { lintLevel, type LintItem } from './lint';
import { remainingPixels, type Move } from './sim';
import { solveLevel, type SolveResult } from './solver';

export interface BotReport {
  runs: number;
  winRate: number;
  /** Average number of moves in a playthrough. */
  moves: number;
  /** Average fewest free deck slots right after a send. */
  tightestDeck: number;
  /** Average share of pixels still standing when a run was lost. */
  leftOnLoss: number;
  /** How often a container was sent with nothing to pull, by color, per run. */
  parkedPerRun: number;
  mostParked: Array<[string, number]>;
  /** Rough play time in seconds, until real play times calibrate it. */
  seconds: number;
}

export interface LevelReport {
  name: string;
  /** Matches the version recorded with playtest results. */
  version: string;
  pixels: number;
  containers: number;
  errors: string[];
  lint: LintItem[];
  solver: SolveResult;
  bots: Record<BotName, BotReport>;
  /** The difficulty score: the average bot's win rate. */
  difficulty: number;
}

/** Rough seconds per move and per pulled pixel, until playtests calibrate them. */
const SECONDS_PER_MOVE = 1.5;
const SECONDS_PER_PIXEL = 0.06;

export interface ReportOptions {
  runs?: Partial<Record<BotName, number>>;
  seed?: number;
  solverBudget?: number;
}

export function reportLevel(level: LevelData, pictures: Map<string, Picture>, options: ReportOptions = {}): LevelReport {
  const errors = validateLevel(level, pictures);
  const pixels = level.boards.reduce((n, b) => n + b.art.join('').replace(/\./g, '').length, 0);
  const containers = level.lanes.flat().length;
  const runs: Record<BotName, number> = { careless: 200, average: 200, careful: 40, ...options.runs };
  const bots = {} as Record<BotName, BotReport>;
  for (const bot of ['careless', 'average', 'careful'] as BotName[]) {
    const rng = seededRng(options.seed ?? 1);
    let wins = 0, moves = 0, tightest = 0, leftOnLoss = 0, losses = 0, parked = 0, seconds = 0;
    const parkedByColor: Record<string, number> = {};
    for (let i = 0; i < runs[bot]; i++) {
      const r = playLevel(level, bot, rng);
      if (r.result === 'win') wins++;
      else { losses++; leftOnLoss += remainingPixels(r.state) / pixels; }
      moves += r.moves.length;
      tightest += r.state.stats.minFreeSlots;
      parked += r.state.stats.parkedSends;
      seconds += r.moves.length * SECONDS_PER_MOVE + r.state.stats.pulls * SECONDS_PER_PIXEL;
      for (const [c, n] of Object.entries(r.state.stats.parkedByColor)) parkedByColor[c] = (parkedByColor[c] ?? 0) + n;
    }
    const n = runs[bot];
    bots[bot] = {
      runs: n,
      winRate: wins / n,
      moves: moves / n,
      tightestDeck: tightest / n,
      leftOnLoss: losses ? leftOnLoss / losses : 0,
      parkedPerRun: parked / n,
      mostParked: Object.entries(parkedByColor).sort((a, z) => z[1] - a[1]).slice(0, 3).map(([c, v]) => [c, v / n]),
      seconds: seconds / n,
    };
  }
  return {
    name: level.name,
    version: levelVersion(level),
    pixels,
    containers,
    errors,
    lint: lintLevel(level),
    solver: solveLevel(level, options.solverBudget ?? 40000),
    bots,
    difficulty: bots.average.winRate,
  };
}

/** A move list as plain text, for replays and debugging. */
export const describeMoves = (moves: Move[]) => moves.map((m) => (m.type === 'send' ? `s${m.lane}` : `f${m.board}`)).join(' ');
