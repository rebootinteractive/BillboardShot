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
