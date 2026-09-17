import type { LevelData } from '../game/level';
import { scoreMove } from './bots';
import { applyMove, cloneState, createState, legalMoves, stateKey, type Move, type State } from './sim';

export interface SolveResult {
  /** 'win' when a winning line was found, 'impossible' when every position was tried, 'unknown' when the budget ran out. */
  result: 'win' | 'impossible' | 'unknown';
  moves: Move[];
  positions: number;
}

/**
 * Depth-first search for a winning line, seeing everything (hidden colors included).
 * Tries the most promising moves first and never revisits a position. It proves a level
 * can be won; it says nothing about how hard that is.
 */
export function solveLevel(level: LevelData, budget = 40000): SolveResult {
  const seen = new Set<string>();
  const path: Move[] = [];
  let positions = 0;
  let exhausted = true;

  const search = (s: State): boolean => {
    if (s.over === 'win') return true;
    if (s.over === 'lose') return false;
    const key = stateKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    if (++positions > budget) {
      exhausted = false;
      return false;
    }
    const moves = legalMoves(s)
      .map((m) => ({ m, score: scoreMove(s, m) }))
      // Choosing a board nothing can pull from never changes the position.
      .filter(({ m, score }) => m.type === 'send' || score > -5)
      .sort((a, z) => z.score - a.score);
    for (const { m } of moves) {
      const next = cloneState(s);
      applyMove(next, m);
      path.push(m);
      if (search(next)) return true;
      path.pop();
      if (positions > budget) return false;
    }
    return false;
  };

  const won = search(createState(level));
  return { result: won ? 'win' : exhausted ? 'impossible' : 'unknown', moves: won ? [...path] : [], positions };
}
