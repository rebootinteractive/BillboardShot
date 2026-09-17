/**
 * Decision rules shared by the game and the simulator. Pure functions over small
 * interfaces, so the animated game and the headless simulation make every rule
 * decision the same way. The rules themselves are documented in
 * docs/level-features.md and docs/level-designer-rules.md.
 */

/** A container as far as the pulling rule is concerned. */
export interface FirerCandidate {
  color: string | null;
  charges: number;
  slot: number;
}

/**
 * Only one container per color pulls at a time: the one with the fewest charges left,
 * ties going to the lower slot. Filling one container first hands its slot back sooner.
 */
export function chooseFirers<T extends FirerCandidate>(onDeck: Iterable<T>): Map<string, T> {
  const chosen = new Map<string, T>();
  for (const c of onDeck) {
    if (c.charges <= 0 || c.color === null) continue;
    const cur = chosen.get(c.color);
    if (!cur || c.charges < cur.charges || (c.charges === cur.charges && c.slot < cur.slot)) chosen.set(c.color, c);
  }
  return chosen;
}

/**
 * Of the pixels a container could pull (the lowest standing pixel of each column in its
 * color), it takes the one in the lowest row; ties go to the column nearest its slot.
 * `slotColumn` maps the container's deck slot onto the board's columns.
 */
export function chooseTarget<T extends { col: number; row: number }>(candidates: readonly T[], slotColumn: number): T | null {
  let best: T | null = null;
  for (const c of candidates) {
    if (!best || c.row < best.row || (c.row === best.row && Math.abs(c.col - slotColumn) < Math.abs(best.col - slotColumn))) best = c;
  }
  return best;
}

/** Where a deck slot sits across a board's columns, for breaking ties between targets. */
export function slotColumn(slot: number, slots: number, cols: number): number {
  return ((slot + 0.5) / Math.max(1, slots)) * cols - 0.5;
}

/** What the send rule needs to know about a lane head and its linked partner. */
export interface SendQuery {
  isHead: boolean;
  /** Present when the head is linked to a container that is still in the queue. */
  partner: { isHead: boolean } | null;
  freeSlots: number;
}

/** Why a lane head cannot be sent right now, or null if it can. */
export function sendBlocker(q: SendQuery): string | null {
  if (!q.isHead) return 'Only the front of a line can go';
  if (q.partner && !q.partner.isHead) return 'Its linked partner has to reach the front too';
  if (q.partner && q.freeSlots < 2) return 'Linked containers need two free slots';
  if (q.freeSlots < 1) return 'Deck is full';
  return null;
}

/**
 * Stuck means no action can ever change anything again: no container on the deck has a
 * color exposed on an open board, and no lane head can be sent. Callers must first make
 * sure nothing is still in flight or about to leave the deck.
 */
export function isStuck(deckColorsWithCharges: Iterable<string>, exposedOnOpenBoards: ReadonlySet<string>, anySendable: boolean): boolean {
  if (anySendable) return false;
  for (const c of deckColorsWithCharges) if (exposedOnOpenBoards.has(c)) return false;
  return true;
}

/**
 * The mystery pixels revealed when `start` is exposed: its connected group through
 * up/down/left/right neighbors of the same color, passing through visible pixels too.
 */
export function floodGroup<T>(start: T, sameColorNeighbors: (cell: T) => Iterable<T>): Array<{ cell: T; distance: number }> {
  const out: Array<{ cell: T; distance: number }> = [];
  const seen = new Set<T>([start]);
  const queue: Array<{ cell: T; distance: number }> = [{ cell: start, distance: 0 }];
  while (queue.length) {
    const item = queue.shift()!;
    out.push(item);
    for (const n of sameColorNeighbors(item.cell)) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push({ cell: n, distance: item.distance + 1 });
    }
  }
  return out;
}

/**
 * The board brought to the front after the front board is cleared: the next remaining
 * board after it, in ring order.
 */
export function nextFront(boardCount: number, cleared: number, remaining: (index: number) => boolean): number | null {
  for (let step = 1; step <= boardCount; step++) {
    const i = (cleared + step) % boardCount;
    if (remaining(i)) return i;
  }
  return null;
}
