import {
  UNKNOWN, applyMove, cloneState, createState, exposedCount, freeSlots, isOpen, legalMoves, maskState,
  remainingPixels, type Move, type State,
} from './sim';
import type { LevelData } from '../game/level';

/**
 * Bots that play a level from what a player can see. Their win rates are the difficulty
 * score. `careless` taps without much thought, `average` looks a little ahead and sometimes acts
 * on impulse, `careful` plays each promising move out a few times before choosing. The
 * planners also have occasional lapses of attention, as people do.
 */

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Visible pixels of a color on open boards. */
function visibleCount(s: State, color: number): number {
  let n = 0;
  for (const b of s.boards) if (isOpen(b)) for (let i = 0; i < b.color.length; i++) if (b.color[i] === color) n++;
  return n;
}

/** How attractive a move looks, judged from the state the bot is given. */
export function scoreMove(s: State, move: Move): number {
  if (move.type === 'send') {
    const head = s.lanes[move.lane][0];
    const partnerLane = head.link === null ? -1 : s.lanes.findIndex((l, k) => k !== move.lane && l[0]?.link === head.link);
    const own = scoreSend(s, move.lane, partnerLane >= 0 ? 2 : 1);
    // A linked partner comes along whether it can pull or not.
    return partnerLane >= 0 ? own + scoreSend(s, partnerLane, 2) : own;
  }
  const b = s.boards[move.board];
  if (!isOpen(b)) return -6;
  let pullable = 0;
  for (const c of s.deck) if (c && c.charges > 0 && c.color !== UNKNOWN) pullable += Math.min(c.charges, exposedCount(b, c.color) * 3);
  // Turning to a board is worth as much as what the deck can pull there.
  return pullable === 0 ? -5 : 2.5 + Math.min(pullable, 60) / 8;
}

function scoreSend(s: State, lane: number, slotsUsed: number): number {
  {
    const head = s.lanes[lane][0];
    if (head.color === UNKNOWN) return -1;
    let exposedNow = 0;
    for (const b of s.boards) if (isOpen(b)) exposedNow += exposedCount(b, head.color);
    const front = s.focus !== null ? s.boards[s.focus] : null;
    const onFront = front && isOpen(front) ? exposedCount(front, head.color) : 0;
    let score = 0;
    if (exposedNow > 0) score += 2 + Math.min(exposedNow, head.charges) / head.charges;
    else if (visibleCount(s, head.color) > 0) score += 0.3;
    else score -= 1;
    // It pulls right away when its color is on the front board.
    if (onFront > 0) score += 1.5;
    if (s.deck.some((c) => c && c.charges > 0 && c.color === head.color)) score -= 2;
    const freeAfter = freeSlots(s) - slotsUsed;
    if (exposedNow === 0 && freeAfter <= 1) score -= 4;
    else if (onFront === 0 && freeAfter <= 1) score -= 1.5;
    return score;
  }
}

function softmaxPick(moves: Move[], scores: number[], temperature: number, rng: Rng): Move {
  const max = Math.max(...scores);
  const weights = scores.map((x) => Math.exp((x - max) / temperature));
  let r = rng() * weights.reduce((a, z) => a + z, 0);
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i];
    if (r <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

export type BotName = 'careless' | 'average' | 'careful';

interface PlannerSettings {
  candidates: number;
  rollouts: number;
  depth: number;
  /** Chance of skipping the planning and taking the move that looks best. */
  impulse: number;
  /**
   * Chance of a lapse: a moment of inattention where the player sends whatever is at the
   * front of some lane, useful or not. Real players do this; a level that punishes one
   * lapse with a stuck deck is harder for people than for a flawless bot.
   */
  lapse: number;
  /**
   * The opening rush: for the first `openingSends` sends, players tend to send what is at
   * the front of the lanes before checking whether it can pull. Lapses happen at
   * `openingLapse` instead of `lapse` during that stretch.
   */
  openingSends: number;
  openingLapse: number;
}

/** Bot settings. Exported so calibration against playtest data can adjust them. */
export const PLANNERS: Record<'average' | 'careful', PlannerSettings> = {
  // Opening rush fitted to the first two playtesters (2026-09-17): 8 sends at 50%.
  average: { candidates: 3, rollouts: 1, depth: 10, impulse: 0.25, lapse: 0.06, openingSends: 8, openingLapse: 0.5 },
  careful: { candidates: 5, rollouts: 3, depth: 40, impulse: 0, lapse: 0.02, openingSends: 0, openingLapse: 0 },
};

/** Choose a move from the player's view of the state. */
export function chooseMove(bot: BotName | 'greedy', view: State, rng: Rng): Move | null {
  const all = legalMoves(view);
  if (!all.length) return null;
  // Choosing a board where nothing can pull changes nothing; only fall back to it.
  const allScores = all.map((m) => scoreMove(view, m));
  const useful = all.filter((m, i) => m.type === 'send' || allScores[i] > -5);
  const moves = useful.length ? useful : all;
  const scores = moves.map((m) => scoreMove(view, m));
  if (bot === 'careless') {
    // Often taps whatever is there, including boards where nothing happens.
    if (rng() < 0.2) return all[Math.floor(rng() * all.length)];
    return softmaxPick(moves, scores, 4, rng);
  }
  if (bot === 'greedy') return softmaxPick(moves, scores, 0.7, rng);
  const plan = PLANNERS[bot];
  const lapse = view.stats.sends < plan.openingSends ? plan.openingLapse : plan.lapse;
  if (rng() < lapse) {
    const sends = all.filter((m) => m.type === 'send');
    const pool = sends.length ? sends : all;
    return pool[Math.floor(rng() * pool.length)];
  }
  if (rng() < plan.impulse) return softmaxPick(moves, scores, 0.7, rng);
  // Try the most promising moves, play each out with greedy play on a guess of the hidden
  // colors, and keep the move that got furthest.
  const ranked = moves.map((m, i) => ({ m, s: scores[i] })).sort((a, z) => z.s - a.s).slice(0, plan.candidates);
  if (ranked.length === 1) return ranked[0].m;
  let best: Move = ranked[0].m;
  let bestValue = -Infinity;
  for (const { m, s: firstScore } of ranked) {
    let total = 0;
    for (let k = 0; k < plan.rollouts; k++) {
      const sim = guessHidden(view, rng);
      applyMove(sim, m);
      for (let depth = 0; depth < plan.depth && sim.over === 'none'; depth++) {
        const reply = chooseMove('greedy', sim, rng);
        if (!reply) break;
        applyMove(sim, reply);
      }
      total += sim.over === 'win' ? 1000 : -remainingPixels(sim) + (sim.over === 'lose' ? -50 : 0) + freeSlots(sim) * 3;
    }
    const value = total / plan.rollouts + firstScore * 0.5;
    if (value > bestValue) {
      bestValue = value;
      best = m;
    }
  }
  return best;
}

/**
 * A copy of the player's view with every hidden pixel group given a plausible color. A
 * player can work this out roughly: the queue and deck show how many charges each color
 * still has, and the visible pixels account for part of them; the rest must be hidden.
 * Each connected group of hidden pixels gets one color, drawn in proportion to that
 * shortfall.
 */
export function guessHidden(view: State, rng: Rng): State {
  const s = cloneState(view);
  const shortfall = new Map<number, number>();
  for (const c of [...s.deck, ...s.lanes.flat()]) if (c && c.color !== UNKNOWN) shortfall.set(c.color, (shortfall.get(c.color) ?? 0) + c.charges);
  for (const b of s.boards) for (let i = 0; i < b.color.length; i++) {
    const c = b.color[i];
    if (c >= 0 && c !== UNKNOWN) shortfall.set(c, (shortfall.get(c) ?? 0) - 1);
  }
  for (const b of s.boards) {
    for (let start = 0; start < b.color.length; start++) {
      if (b.color[start] !== UNKNOWN) continue;
      const group: number[] = [];
      const stack = [start];
      b.color[start] = -2;
      while (stack.length) {
        const i = stack.pop()!;
        group.push(i);
        const col = Math.floor(i / b.rows), row = i % b.rows;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = col + dc, rr = row + dr;
          if (cc < 0 || rr < 0 || cc >= b.cols || rr >= b.rows) continue;
          const j = cc * b.rows + rr;
          if (b.color[j] === UNKNOWN) { b.color[j] = -2; stack.push(j); }
        }
      }
      const options = [...shortfall].filter(([, n]) => n > 0);
      let pick = UNKNOWN;
      if (options.length) {
        let r = rng() * options.reduce((sum, [, n]) => sum + n, 0);
        for (const [color, n] of options) {
          r -= n;
          if (r <= 0) { pick = color; break; }
        }
        if (pick === UNKNOWN) pick = options[options.length - 1][0];
        shortfall.set(pick, (shortfall.get(pick) ?? 0) - group.length);
      }
      for (const i of group) b.color[i] = pick;
    }
  }
  return s;
}


export interface PlayResult {
  result: 'win' | 'lose' | 'timeout';
  moves: Move[];
  state: State;
}

/** One playthrough. The bot decides from the masked view; moves apply to the real state. */
export function playLevel(level: LevelData, bot: BotName, rng: Rng, maxMoves = 1500): PlayResult {
  const s = createState(level);
  const moves: Move[] = [];
  while (s.over === 'none' && moves.length < maxMoves) {
    const move = chooseMove(bot, maskState(s), rng);
    if (!move) break;
    applyMove(s, move);
    moves.push(move);
  }
  return { result: s.over === 'none' ? 'timeout' : s.over, moves, state: s };
}

