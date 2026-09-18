export interface HudCallbacks {
  onRestart(): void;
  onNext(): void;
  onSendResults(): void;
}

export interface LevelOption {
  value: string;
  label: string;
  group: string;
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly tilesEl: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly deckEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private levelSelect: HTMLSelectElement | null = null;
  private modalEl: HTMLDivElement | null = null;
  private hintTimer = 0;

  constructor(parent: HTMLElement, private readonly cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hud-layer';
    this.root.innerHTML = `
      <div class="hud-level-row"><div class="hud-level">Level <strong data-level>1</strong></div></div>
      <div class="hud-top">
        <div class="hud-stat"><span class="lbl">Pixels</span><strong data-tiles>0</strong></div>
        <div class="hud-stat"><span class="lbl">Deck</span><strong data-deck>0/0</strong></div>
        <div class="hud-stat"><span class="lbl">Containers</span><strong data-ammo>0</strong></div>
      </div>
      <div class="hud-hint" data-hint></div>
      <button class="hud-send" data-send title="Email your playtest results to the team">✉ Send results</button>
    `;
    parent.appendChild(this.root);
    this.tilesEl = this.root.querySelector('[data-tiles]')!;
    this.ammoEl = this.root.querySelector('[data-ammo]')!;
    this.deckEl = this.root.querySelector('[data-deck]')!;
    this.hintEl = this.root.querySelector('[data-hint]')!;
    this.levelEl = this.root.querySelector('[data-level]')!;
    this.root.querySelector('[data-send]')!.addEventListener('click', () => this.cb.onSendResults());
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

  setStats(tiles: number, deckUsed: number, deckTotal: number, ammo: number) {
    this.tilesEl.textContent = String(tiles);
    this.deckEl.textContent = `${deckUsed}/${deckTotal}`;
    this.ammoEl.textContent = String(ammo);
    this.deckEl.classList.toggle('danger', deckTotal > 0 && deckUsed >= deckTotal);
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
    this.root.remove();
  }
}
