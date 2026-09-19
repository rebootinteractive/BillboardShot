export interface HudCallbacks {
  onRestart(): void;
  onNext(): void;
  onSendResults(): void;
  /** Erase saved progress and playtest results, then start over. */
  onClearData(): void;
  /** How many playtest attempts are saved, shown before clearing them. */
  savedAttempts(): number;
}

export interface LevelOption {
  value: string;
  label: string;
  group: string;
}

const GEAR_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1a.5.5 0 0 0-.6.2L2.6 8.8a.5.5 0 0 0 .1.6L4.7 11a7.6 7.6 0 0 0 0 2l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.3.4.5.4h3.8c.2 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>`;

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly hintEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private levelSelect: HTMLSelectElement | null = null;
  private modalEl: HTMLDivElement | null = null;
  /** Separate from modalEl, so a level ending while it is open still shows its result. */
  private settingsEl: HTMLDivElement | null = null;
  private hintTimer = 0;

  constructor(parent: HTMLElement, private readonly cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hud-layer';
    this.root.innerHTML = `
      <div class="hud-level-row"><div class="hud-level">Level <strong data-level>1</strong></div></div>
      <div class="hud-hint" data-hint></div>
      <button class="hud-settings" data-settings title="Settings" aria-label="Settings">${GEAR_SVG}</button>
    `;
    parent.appendChild(this.root);
    this.hintEl = this.root.querySelector('[data-hint]')!;
    this.levelEl = this.root.querySelector('[data-level]')!;
    this.root.querySelector('[data-settings]')!.addEventListener('click', () => this.openSettings());
  }

  /** Settings: send playtest results, or clear everything saved on this device. */
  openSettings() {
    if (this.settingsEl) return;
    const el = document.createElement('div');
    el.className = 'modal settings';
    el.innerHTML = `
      <div class="modal-card settings-card" role="dialog" aria-label="Settings">
        <div class="settings-main">
          <h2>Settings</h2>
          <button class="settings-row" data-send>
            <span class="settings-icon">✉</span>
            <span><b>Send results</b><small>Email your playtest results to the team</small></span>
          </button>
          <button class="settings-row danger" data-clear>
            <span class="settings-icon">⟲</span>
            <span><b>Clear data</b><small>Start over from level 1 on this device</small></span>
          </button>
          <div class="modal-actions"><button class="btn" data-close>Done</button></div>
        </div>
        <div class="settings-confirm" hidden>
          <h2>Clear all data?</h2>
          <p data-confirm-text></p>
          <div class="modal-actions">
            <button class="btn ghost" data-cancel>Cancel</button>
            <button class="btn danger" data-erase>Clear data</button>
          </div>
        </div>
      </div>`;
    const main = el.querySelector<HTMLElement>('.settings-main')!;
    const confirm = el.querySelector<HTMLElement>('.settings-confirm')!;
    const close = () => this.closeSettings();
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    el.querySelector('[data-close]')!.addEventListener('click', close);
    el.querySelector('[data-send]')!.addEventListener('click', () => {
      close();
      this.cb.onSendResults();
    });
    el.querySelector('[data-clear]')!.addEventListener('click', () => {
      const n = this.cb.savedAttempts();
      confirm.querySelector('[data-confirm-text]')!.textContent =
        `Your level progress will be reset to level 1${n ? `, and the ${n} playtest result${n === 1 ? '' : 's'} saved on this device will be deleted. Send them first if the team doesn't have them yet` : ''}. This can't be undone.`;
      main.hidden = true;
      confirm.hidden = false;
    });
    el.querySelector('[data-cancel]')!.addEventListener('click', () => {
      confirm.hidden = true;
      main.hidden = false;
    });
    el.querySelector('[data-erase]')!.addEventListener('click', () => this.cb.onClearData());
    this.root.parentElement!.appendChild(el);
    this.settingsEl = el;
  }

  closeSettings() {
    this.settingsEl?.remove();
    this.settingsEl = null;
  }

  /** A one-line explanation of something new in this level, dismissed with "Got it". */
  showIntro(text: string) {
    if (this.modalEl) return;
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-card intro">
        <h2>Something new</h2>
        <p></p>
        <div class="modal-actions"><button class="btn" data-ok>Got it</button></div>
      </div>`;
    el.querySelector('p')!.textContent = text;
    el.querySelector('[data-ok]')!.addEventListener('click', () => this.dismiss());
    this.root.parentElement!.appendChild(el);
    this.modalEl = el;
  }

  /** `value` marks the matching entry in the debug level picker, when it is enabled. */
  setLevel(label: string, value?: string) {
    this.levelEl.textContent = label;
    if (this.levelSelect && value !== undefined) this.levelSelect.value = value;
  }

  /**
   * The peak marker beside the level number. Naming a hard level before it is played
   * turns a loss into a challenge taken on rather than something that came out of nowhere.
   */
  setDifficultyLabel(label: 'hard' | 'very hard' | null) {
    const existing = this.root.querySelector('.hud-level-peak');
    if (!label) {
      existing?.remove();
      return;
    }
    const chip = existing ?? document.createElement('div');
    chip.className = `hud-level-peak${label === 'very hard' ? ' severe' : ''}`;
    chip.textContent = label === 'very hard' ? 'VERY HARD' : 'HARD';
    if (!existing) this.root.querySelector('.hud-level-row')!.appendChild(chip);
  }

  /**
   * Debug only: turns the level pill into a dropdown of every level, with a step back and
   * forward either side of it. The native select sits invisibly over the pill, so a tap
   * opens the system picker on a phone too; the arrows are siblings of the pill rather
   * than children so the select cannot swallow their taps.
   */
  enableLevelPicker(options: LevelOption[], onPick: (value: string) => void, onStep: (delta: number) => void) {
    const pill = this.root.querySelector('.hud-level')!;
    const row = this.root.querySelector('.hud-level-row')!;
    for (const [delta, glyph, label] of [[-1, '‹', 'Previous level'], [1, '›', 'Next level']] as const) {
      const button = document.createElement('button');
      button.className = 'hud-level-step';
      button.textContent = glyph;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => onStep(delta));
      if (delta < 0) row.insertBefore(button, pill);
      else row.appendChild(button);
    }
    pill.classList.add('pickable');
    const select = document.createElement('select');
    select.className = 'hud-level-select';
    select.setAttribute('aria-label', 'Choose level');
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const option of options) {
      let group = groups.get(option.group);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = option.group;
        select.appendChild(group);
        groups.set(option.group, group);
      }
      group.appendChild(new Option(option.label, option.value));
    }
    select.addEventListener('change', () => {
      select.blur();
      onPick(select.value);
    });
    pill.appendChild(select);
    this.levelSelect = select;
  }

  flash(msg: string) {
    this.hintEl.textContent = msg;
    this.hintEl.classList.add('show');
    this.hintTimer = 1.4;
  }

  tick(dt: number) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
  }

  showEnd(win: boolean, subtitle: string) {
    if (this.modalEl) return;
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-card endgame ${win ? 'win' : 'lose'}">
        <h1>${win ? 'Cleared!' : 'Stuck'}</h1>
        <p>${subtitle}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-send>✉ Send results</button>
          <button class="btn" data-action>${win ? 'Next level' : 'Try again'}</button>
        </div>
      </div>`;
    el.querySelector('[data-send]')!.addEventListener('click', () => this.cb.onSendResults());
    el.querySelector('[data-action]')!.addEventListener('click', () => {
      this.dismiss();
      if (win) this.cb.onNext();
      else this.cb.onRestart();
    });
    this.root.parentElement!.appendChild(el);
    this.modalEl = el;
  }

  dismiss() {
    this.hintTimer = 0;
    this.hintEl.classList.remove('show');
    this.modalEl?.remove();
    this.modalEl = null;
  }

  dispose() {
    this.dismiss();
    this.closeSettings();
    this.root.remove();
  }
}
