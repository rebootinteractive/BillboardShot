const KEY = 'billboardshot.level';

/**
 * The player's level number, starting at 1. `?level=N` in the address jumps
 * straight to a level for testing; otherwise it is whatever was reached last.
 */
export function loadLevelNumber(): number {
  const param = Number(new URLSearchParams(location.search).get('level'));
  if (Number.isInteger(param) && param >= 1) return param;
  try {
    const saved = Number(localStorage.getItem(KEY));
    if (Number.isInteger(saved) && saved >= 1) return saved;
  } catch {
    /* storage blocked: start from the beginning */
  }
  return 1;
}

export function saveLevelNumber(n: number) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    /* storage blocked: progress lasts for this visit only */
  }
}

/** Every key the game stores in this browser starts with this. */
const PREFIX = 'billboardshot.';

/**
 * Erase everything the game keeps in this browser: level progress, playtest results
 * and the device id. The caller should reload afterwards.
 */
export function clearSavedData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* storage blocked: there is nothing saved to clear */
  }
}
