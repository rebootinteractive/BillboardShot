/**
 * Playtest analytics, kept in the player's own browser. Every attempt at a level is one
 * record; the player sends them all to the team by email with the "Send results" button.
 * Nothing leaves the device unless the player sends it.
 */

const STORAGE_KEY = 'billboardshot.playtest';
const DEVICE_KEY = 'billboardshot.device';
const MAX_ATTEMPTS = 1000;
/** Seconds without a tap or swipe after which the player counts as away. */
const IDLE_AFTER = 10;
export const RESULTS_EMAIL = 'admin@reboot.ist';

export type AttemptResult = 'playing' | 'win' | 'lose' | 'abandoned';

export interface Attempt {
  /** Level number the player saw, and the level file behind it. */
  level: number;
  file: string;
  name: string;
  /** Fingerprint of the level's content; changes whenever the level is edited. */
  version: string;
  /** 1 for the first try at this version of the level on this device. */
  attempt: number;
  result: AttemptResult;
  /**
   * Engaged play time in seconds: time within IDLE_AFTER seconds of the last tap or swipe.
   * The game does not advance at all while the tab is hidden.
   */
  seconds: number;
  /** Time the game was open but untouched for longer than IDLE_AFTER seconds. */
  idleSeconds: number;
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
  private sinceInput = 0;

  /** A new attempt begins. An attempt still in progress counts as abandoned. */
  start(info: { level: number; file: string; name: string; version: string; pixelsTotal: number; deckSlots: number }) {
    this.abandon();
    // Attempts left 'playing' by a closed page never finished.
    const attempts = load().map((a) => (a.result === 'playing' ? { ...a, result: 'abandoned' as const } : a));
    const previous = attempts.filter((a) => a.file === info.file && a.version === info.version).length;
    this.current = {
      level: info.level, file: info.file, name: info.name, version: info.version, attempt: previous + 1, result: 'playing',
      seconds: 0, idleSeconds: 0, sends: 0, boardChanges: 0, pixelsLeft: info.pixelsTotal, pixelsTotal: info.pixelsTotal,
      minFreeSlots: info.deckSlots, startedAt: new Date().toISOString(),
    };
    this.sinceInput = 0;
    save([...attempts, this.current]);
    return this.current.attempt;
  }

  tick(dt: number) {
    if (this.current?.result !== 'playing') return;
    this.sinceInput += dt;
    if (this.sinceInput <= IDLE_AFTER) this.current.seconds += dt;
    else this.current.idleSeconds += dt;
  }

  /** Any tap or swipe: the player is engaged again. */
  input() {
    this.sinceInput = 0;
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

  /** Forget the attempt in progress without saving it, e.g. before the data is cleared. */
  discard() {
    this.current = null;
  }

  abandon(pixelsLeft?: number) {
    if (this.current?.result !== 'playing') return;
    this.current.result = 'abandoned';
    this.persist(pixelsLeft);
    this.current = null;
  }
}

const CSV_HEADER = 'level,file,version,attempt,result,seconds,idleSeconds,sends,boardChanges,pixelsLeft,pixelsTotal,minFreeSlots,startedAt';

function csvLine(a: Attempt): string {
  return [a.level, a.file, a.version ?? '', a.attempt, a.result, Math.round(a.seconds), Math.round(a.idleSeconds ?? 0), a.sends,
    a.boardChanges, a.pixelsLeft, a.pixelsTotal, a.minFreeSlots, a.startedAt.replace(/\.\d+Z$/, 'Z')].join(',');
}

function header(count: number): string[] {
  return ['BillboardShot playtest results', `device ${deviceId()} · ${count} attempts · exported ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`, ''];
}

/** How many attempts are saved on this device. */
export function savedAttemptCount(): number {
  return load().length;
}

/** All attempts as compact text: a short header, then one CSV line per attempt. */
export function exportResults(): string {
  const attempts = load();
  return [...header(attempts.length), CSV_HEADER, ...attempts.map(csvLine)].join('\n');
}

/**
 * Encode text for a mail link. Commas and colons are allowed as they are in the query
 * part of a URL, and leaving them unescaped keeps the link about half as long.
 */
function mailEncode(text: string): string {
  return encodeURIComponent(text).replace(/%2C/g, ',').replace(/%3A/g, ':');
}

/** Longest mail link we build; phone mail apps take far more, desktop handlers can be stricter. */
const MAX_MAIL_LINK = 8000;

/**
 * Open an email to the team with the results in its body. The results are also copied to
 * the clipboard. If there are more than fit in a mail link, the email carries the most
 * recent attempts and says so, and the full results are saved as a file to attach.
 */
export async function sendResults(open: (url: string) => void = (url) => { location.href = url; }): Promise<'mail' | 'mail-partial' | 'empty'> {
  const attempts = load();
  if (attempts.length === 0) return 'empty';
  const full = exportResults();
  try {
    await navigator.clipboard.writeText(full);
  } catch {
    /* clipboard blocked: the email body carries the results */
  }
  const subject = mailEncode('BillboardShot playtest results');
  const link = (rows: Attempt[], note: string[]) =>
    `mailto:${RESULTS_EMAIL}?subject=${subject}&body=${mailEncode([...header(attempts.length), ...note, CSV_HEADER, ...rows.map(csvLine)].join('\n'))}`;

  let rows = attempts;
  let href = link(rows, []);
  if (href.length <= MAX_MAIL_LINK) {
    open(href);
    return 'mail';
  }
  // Too long for a mail link: keep the most recent attempts that fit.
  let keep = attempts.length;
  while (keep > 1 && href.length > MAX_MAIL_LINK) {
    keep = Math.floor(keep * 0.8);
    rows = attempts.slice(-keep);
    href = link(rows, [`Only the latest ${keep} of ${attempts.length} attempts fit here. Please attach the saved file billboardshot-results-${deviceId()}.csv, or paste the full results from the clipboard.`, '']);
  }
  const blob = new Blob([full], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `billboardshot-results-${deviceId()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  open(href);
  return 'mail-partial';
}
