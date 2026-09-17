/**
 * Playtest analytics, kept in the player's own browser. Every attempt at a level is one
 * record; the player sends them all to the team by email with the "Send results" button.
 * Nothing leaves the device unless the player sends it.
 */

const STORAGE_KEY = 'billboardshot.playtest';
const DEVICE_KEY = 'billboardshot.device';
const MAX_ATTEMPTS = 1000;
export const RESULTS_EMAIL = 'admin@reboot.ist';

export type AttemptResult = 'playing' | 'win' | 'lose' | 'abandoned';

export interface Attempt {
  /** Level number the player saw, and the level file behind it. */
  level: number;
  file: string;
  name: string;
  /** 1 for the first try at this level file on this device. */
  attempt: number;
  result: AttemptResult;
  /** Active play time in seconds (the game does not advance while the tab is hidden). */
  seconds: number;
  sends: number;
  /** Times the board at the front changed. */
  boardChanges: number;
  pixelsLeft: number;
  pixelsTotal: number;
  /** Fewest free deck slots right after a send. */
  minFreeSlots: number;
  startedAt: string;
}

function load(): Attempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(attempts: Attempt[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts.slice(-MAX_ATTEMPTS)));
  } catch {
    /* storage blocked or full: this attempt is simply not kept */
  }
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/** Tracks the attempt in progress and writes every change straight to storage. */
export class Playtest {
  private current: Attempt | null = null;

  /** A new attempt begins. An attempt still in progress counts as abandoned. */
  start(info: { level: number; file: string; name: string; pixelsTotal: number; deckSlots: number }) {
    this.abandon();
    // Attempts left 'playing' by a closed page never finished.
    const attempts = load().map((a) => (a.result === 'playing' ? { ...a, result: 'abandoned' as const } : a));
    const previous = attempts.filter((a) => a.file === info.file).length;
    this.current = {
      level: info.level, file: info.file, name: info.name, attempt: previous + 1, result: 'playing',
      seconds: 0, sends: 0, boardChanges: 0, pixelsLeft: info.pixelsTotal, pixelsTotal: info.pixelsTotal,
      minFreeSlots: info.deckSlots, startedAt: new Date().toISOString(),
    };
    save([...attempts, this.current]);
    return this.current.attempt;
  }

  tick(dt: number) {
    if (this.current?.result === 'playing') this.current.seconds += dt;
  }

  send(freeSlotsAfter: number) {
    if (this.current?.result !== 'playing') return;
    this.current.sends++;
    this.current.minFreeSlots = Math.min(this.current.minFreeSlots, freeSlotsAfter);
    this.persist();
  }

  boardChanged() {
    if (this.current?.result !== 'playing') return;
    this.current.boardChanges++;
  }

  finish(result: 'win' | 'lose', pixelsLeft: number) {
    if (this.current?.result !== 'playing') return;
    this.current.result = result;
    this.current.pixelsLeft = pixelsLeft;
    this.persist();
  }

  /** Save progress so far, e.g. when the page is about to close. */
  persist(pixelsLeft?: number) {
    if (!this.current) return;
    if (pixelsLeft !== undefined) this.current.pixelsLeft = pixelsLeft;
    const attempts = load();
    const i = attempts.findIndex((a) => a.startedAt === this.current!.startedAt && a.file === this.current!.file);
    if (i >= 0) attempts[i] = this.current;
    else attempts.push(this.current);
    save(attempts);
  }

  abandon(pixelsLeft?: number) {
    if (this.current?.result !== 'playing') return;
    this.current.result = 'abandoned';
    this.persist(pixelsLeft);
    this.current = null;
  }
}

/** All attempts as compact text: a short header, then one CSV line per attempt. */
export function exportResults(): string {
  const attempts = load();
  const lines = [
    'BillboardShot playtest results',
    `device ${deviceId()} · ${attempts.length} attempts · exported ${new Date().toISOString()}`,
    '',
    'level,file,attempt,result,seconds,sends,boardChanges,pixelsLeft,pixelsTotal,minFreeSlots,startedAt',
    ...attempts.map((a) => [a.level, a.file, a.attempt, a.result, Math.round(a.seconds), a.sends, a.boardChanges, a.pixelsLeft, a.pixelsTotal, a.minFreeSlots, a.startedAt].join(',')),
  ];
  return lines.join('\n');
}

/**
 * Open an email to the team with the results. Mail links have a length limit, so long
 * results are also copied to the clipboard and downloaded as a file to attach.
 */
export async function sendResults(): Promise<'mail' | 'mail+clipboard' | 'empty'> {
  const text = exportResults();
  if (load().length === 0) return 'empty';
  const subject = encodeURIComponent('BillboardShot playtest results');
  const full = `mailto:${RESULTS_EMAIL}?subject=${subject}&body=${encodeURIComponent(text)}`;
  if (full.length <= 1900) {
    location.href = full;
    return 'mail';
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked: the downloaded file still has everything */
  }
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `billboardshot-results-${deviceId()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  const body = encodeURIComponent('My results were copied to the clipboard and saved as a file (billboardshot-results-….csv).\nPlease paste them here or attach the file.\n\n');
  location.href = `mailto:${RESULTS_EMAIL}?subject=${subject}&body=${body}`;
  return 'mail+clipboard';
}
