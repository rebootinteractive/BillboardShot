import type { ColorKey } from '../shared/types';
import { COLOR_KEYS } from '../shared/colors';
import { KEY_COLORS, type KeyColor } from '../shared/keyColors';
import { artColor, isMysteryChar, type LevelData } from '../game/level';
import { chooseFirers, chooseTarget, floodGroup, isStuck, nextFront, sendBlocker, slotColumn } from './core';

/**
 * A headless model of a level, played as discrete moves. It follows the player model in
 * docs/level-design-strategy.md: a move is sending a lane head or choosing the front
 * board, and after every move each container on the deck pulls until nothing more can be
 * pulled. Timing (walking, flight, animations) is left out.
 */

/** Color index into COLOR_KEYS; EMPTY for no pixel, UNKNOWN for a color the viewer cannot see. */
export const EMPTY = -1;
export const UNKNOWN = 99;

export interface Board {
  cols: number;
  rows: number;
  /** Per cell, index col * rows + row, row 0 at the bottom. */
  color: Int8Array;
  hidden: Uint8Array;
  /** Key color index on the cell, or -1. */
  key: Int8Array;
  alive: number;
  lock: null | { type: 'key'; key: number } | { type: 'frozen'; color: number; remaining: number };
}

export interface Container {
  /** Creation order: lane by lane, head first. Also the order containers take turns pulling. */
  id: number;
  color: number;
  capacity: number;
  charges: number;
  hidden: boolean;
  link: string | null;
}

export interface Stats {
  sends: number;
  focuses: number;
  pulls: number;
  /** Fewest free deck slots right after any send. */
  minFreeSlots: number;
  /** Sends of a container whose color was not exposed on any open board at that moment. */
  parkedSends: number;
  parkedByColor: Record<string, number>;
}

export interface State {
  boards: Board[];
  lanes: Container[][];
  deck: (Container | null)[];
  focus: number | null;
  over: 'none' | 'win' | 'lose';
  stats: Stats;
}

export type Move = { type: 'send'; lane: number } | { type: 'focus'; board: number };

const colorIndex = (c: ColorKey) => COLOR_KEYS.indexOf(c);
export const colorName = (i: number) => (i === UNKNOWN ? 'unknown' : COLOR_KEYS[i]);

export function createState(level: LevelData): State {
  const boards: Board[] = level.boards.map((data) => {
    const rows = data.art.length;
    const cols = data.art[0].length;
    const n = cols * rows;
    const board: Board = { cols, rows, color: new Int8Array(n).fill(EMPTY), hidden: new Uint8Array(n), key: new Int8Array(n).fill(-1), alive: 0, lock: null };
    data.art.forEach((line, top) => {
      const row = rows - 1 - top;
      [...line].forEach((ch, col) => {
        const c = artColor(ch);
        if (!c) return;
        const i = col * rows + row;
        board.color[i] = colorIndex(c);
        board.hidden[i] = isMysteryChar(ch) ? 1 : 0;
        board.alive++;
      });
    });
    for (const k of data.keys ?? []) board.key[k.col * rows + (rows - 1 - k.row)] = KEY_COLORS.indexOf(k.color);
    if (data.lock?.type === 'key') board.lock = { type: 'key', key: KEY_COLORS.indexOf(data.lock.color) };
    if (data.lock?.type === 'frozen') board.lock = { type: 'frozen', color: colorIndex(data.lock.color), remaining: data.lock.count };
    return board;
  });
  let id = 0;
  const lanes = level.lanes.map((lane) => lane.map((c) => ({
    id: id++, color: colorIndex(c.color), capacity: c.charges, charges: c.charges, hidden: !!c.hidden, link: c.link ?? null,
  })));
  const state: State = {
    boards, lanes, deck: new Array(level.deckSlots).fill(null), focus: 0, over: 'none',
    stats: { sends: 0, focuses: 0, pulls: 0, minFreeSlots: level.deckSlots, parkedSends: 0, parkedByColor: {} },
  };
  for (const lane of lanes) if (lane[0]) lane[0].hidden = false;
  for (const b of boards) revealExposed(b);
  return state;
}

export function cloneState(s: State): State {
  const copy = (c: Container | null) => (c ? { ...c } : null);
  return {
    boards: s.boards.map((b) => ({ ...b, color: b.color.slice(), hidden: b.hidden.slice(), key: b.key.slice(), lock: b.lock ? { ...b.lock } : null })),
    lanes: s.lanes.map((l) => l.map((c) => ({ ...c }))),
    deck: s.deck.map(copy),
    focus: s.focus,
    over: s.over,
    stats: { ...s.stats, parkedByColor: { ...s.stats.parkedByColor } },
  };
}

/**
 * What a player can see: mystery pixels and hidden containers (below the lane head) have
 * unknown colors. Bots that score difficulty decide from this view only.
 */
export function maskState(s: State): State {
  const m = cloneState(s);
  for (const b of m.boards) for (let i = 0; i < b.color.length; i++) if (b.hidden[i] && b.color[i] !== EMPTY) b.color[i] = UNKNOWN;
  for (const lane of m.lanes) lane.forEach((c, j) => { if (j > 0 && c.hidden) c.color = UNKNOWN; });
  return m;
}

/** A compact key for a position: removed pixels per column, the queue, the deck and the focus. */
export function stateKey(s: State): string {
  const parts: string[] = [];
  for (const b of s.boards) {
    let cols = '';
    for (let c = 0; c < b.cols; c++) cols += lowestRow(b, c).toString(36) + '.';
    parts.push(cols + (b.lock ? (b.lock.type === 'frozen' ? `f${b.lock.remaining}` : 'k') : ''));
  }
  parts.push(s.lanes.map((l) => l.length).join(','));
  parts.push(s.deck.map((c) => (c ? `${c.id}:${c.charges}` : '_')).join(','));
  parts.push(String(s.focus));
  return parts.join('|');
}

// ------------------------------------------------------------------ board queries

export function lowestRow(b: Board, col: number): number {
  for (let row = 0; row < b.rows; row++) if (b.color[col * b.rows + row] !== EMPTY) return row;
  return b.rows;
}

export const isOpen = (b: Board) => b.lock === null && b.alive > 0;

/** Colors at the bottom of some column of a board (unknown colors excluded). */
export function exposedColors(b: Board, into = new Set<number>()): Set<number> {
  for (let c = 0; c < b.cols; c++) {
    const row = lowestRow(b, c);
    if (row < b.rows) {
      const color = b.color[c * b.rows + row];
      if (color !== UNKNOWN) into.add(color);
    }
  }
  return into;
}

/** How many columns of a board have `color` at the bottom. */
export function exposedCount(b: Board, color: number): number {
  let n = 0;
  for (let c = 0; c < b.cols; c++) {
    const row = lowestRow(b, c);
    if (row < b.rows && b.color[c * b.rows + row] === color) n++;
  }
  return n;
}

export function openExposedColors(s: State): Set<number> {
  const set = new Set<number>();
  for (const b of s.boards) if (isOpen(b)) exposedColors(b, set);
  return set;
}

export const freeSlots = (s: State) => s.deck.filter((c) => c === null).length;

/** Reveal a mystery pixel that became the lowest in its column, flooding its color group. */
function revealColumn(b: Board, col: number) {
  const row = lowestRow(b, col);
  if (row >= b.rows) return;
  const start = col * b.rows + row;
  if (!b.hidden[start] || b.color[start] === UNKNOWN) return;
  const color = b.color[start];
  const group = floodGroup(start, (i) => {
    const c = Math.floor(i / b.rows), r = i % b.rows;
    const out: number[] = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= b.cols || rr >= b.rows) continue;
      const j = cc * b.rows + rr;
      if (b.color[j] === color) out.push(j);
    }
    return out;
  });
  for (const { cell } of group) b.hidden[cell] = 0;
}

function revealExposed(b: Board) {
  for (let c = 0; c < b.cols; c++) revealColumn(b, c);
}

// ------------------------------------------------------------------ moves

function partnerOf(s: State, c: Container): { container: Container; lane: number } | null {
  if (!c.link) return null;
  for (let k = 0; k < s.lanes.length; k++) {
    const other = s.lanes[k].find((o) => o !== c && o.link === c.link);
    if (other) return { container: other, lane: k };
  }
  return null;
}

export function laneBlocker(s: State, lane: number): string | null {
  const head = s.lanes[lane][0];
  if (!head) return 'Empty lane';
  const partner = partnerOf(s, head);
  return sendBlocker({
    isHead: true,
    partner: partner ? { isHead: s.lanes[partner.lane][0] === partner.container } : null,
    freeSlots: freeSlots(s),
  });
}

export function legalMoves(s: State): Move[] {
  if (s.over !== 'none') return [];
  const moves: Move[] = [];
  s.lanes.forEach((_, lane) => { if (laneBlocker(s, lane) === null) moves.push({ type: 'send', lane }); });
  s.boards.forEach((b, board) => { if (b.alive > 0 && board !== s.focus) moves.push({ type: 'focus', board }); });
  return moves;
}

/** Apply a move in place, resolve pulls, and decide whether the level is over. */
export function applyMove(s: State, move: Move) {
  if (move.type === 'send') {
    const head = s.lanes[move.lane][0];
    const partner = partnerOf(s, head);
    const group = partner ? [{ container: head, lane: move.lane }, partner] : [{ container: head, lane: move.lane }];
    const exposed = openExposedColors(s);
    for (const { container, lane } of group) {
      s.lanes[lane].shift();
      if (s.lanes[lane][0]) s.lanes[lane][0].hidden = false;
      s.deck[s.deck.indexOf(null)] = container;
      container.hidden = false;
      s.stats.sends++;
      if (!exposed.has(container.color)) {
        s.stats.parkedSends++;
        const name = colorName(container.color);
        s.stats.parkedByColor[name] = (s.stats.parkedByColor[name] ?? 0) + 1;
      }
    }
    s.stats.minFreeSlots = Math.min(s.stats.minFreeSlots, freeSlots(s));
  } else {
    s.focus = move.board;
    s.stats.focuses++;
  }
  settle(s);
  checkEnd(s);
}

/** Pull until no container on the deck can pull from the front board. */
export function settle(s: State) {
  for (let guard = 0; guard < 100000; guard++) {
    if (s.focus === null) return;
    const b = s.boards[s.focus];
    if (!isOpen(b)) return;
    const onDeck = s.deck.flatMap((c, slot) => (c ? [{ c, slot, color: c.color === UNKNOWN ? null : String(c.color), charges: c.charges }] : []));
    const firers = [...chooseFirers(onDeck).values()].sort((a, z) => a.c.id - z.c.id);
    let progress = false;
    for (const f of firers) {
      if (!isOpen(b)) break;
      const candidates: Array<{ col: number; row: number }> = [];
      for (let col = 0; col < b.cols; col++) {
        const row = lowestRow(b, col);
        if (row < b.rows && b.color[col * b.rows + row] === f.c.color) candidates.push({ col, row });
      }
      const t = chooseTarget(candidates, slotColumn(f.slot, s.deck.length, b.cols));
      if (!t) continue;
      pull(s, b, t.col, t.row, f.c, f.slot);
      progress = true;
    }
    if (b.alive === 0) {
      s.focus = nextFront(s.boards.length, s.focus, (i) => s.boards[i].alive > 0);
      continue;
    }
    if (!progress) return;
  }
}

function pull(s: State, b: Board, col: number, row: number, c: Container, slot: number) {
  const i = col * b.rows + row;
  const key = b.key[i];
  b.color[i] = EMPTY;
  b.hidden[i] = 0;
  b.key[i] = -1;
  b.alive--;
  c.charges--;
  s.stats.pulls++;
  if (key >= 0) for (const other of s.boards) if (other.lock?.type === 'key' && other.lock.key === key) other.lock = null;
  revealColumn(b, col);
  if (c.charges > 0) return;
  // A full container leaves; frozen boards of its color count its whole load.
  s.deck[slot] = null;
  for (const other of s.boards) {
    if (other.lock?.type !== 'frozen' || other.lock.color !== c.color || other.alive === 0) continue;
    other.lock.remaining -= c.capacity;
    if (other.lock.remaining <= 0) other.lock = null;
  }
}

function checkEnd(s: State) {
  if (s.boards.every((b) => b.alive === 0)) {
    s.over = 'win';
    return;
  }
  const deckColors = s.deck.flatMap((c) => (c && c.charges > 0 && c.color !== UNKNOWN ? [String(c.color)] : []));
  const exposed = new Set([...openExposedColors(s)].map(String));
  const anySendable = s.lanes.some((_, lane) => laneBlocker(s, lane) === null);
  if (isStuck(deckColors, exposed, anySendable)) s.over = 'lose';
}

export const remainingPixels = (s: State) => s.boards.reduce((n, b) => n + b.alive, 0);
