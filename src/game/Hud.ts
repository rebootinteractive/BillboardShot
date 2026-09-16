export interface HudCallbacks {
  onRestart(): void;
  onNext(): void;
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly tilesEl: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly deckEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private modalEl: HTMLDivElement | null = null;
  private hintTimer = 0;

  constructor(parent: HTMLElement, private readonly cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hud-layer';
    this.root.innerHTML = `
      <div class="hud-level">Level <strong data-level>1</strong></div>
      <div class="hud-top">
        <div class="hud-stat"><span class="lbl">Pixels</span><strong data-tiles>0</strong></div>
        <div class="hud-stat"><span class="lbl">Deck</span><strong data-deck>0/0</strong></div>
        <div class="hud-stat"><span class="lbl">Containers</span><strong data-ammo>0</strong></div>
      </div>
      <div class="hud-hint" data-hint></div>
    `;
    parent.appendChild(this.root);
    this.tilesEl = this.root.querySelector('[data-tiles]')!;
    this.ammoEl = this.root.querySelector('[data-ammo]')!;
    this.deckEl = this.root.querySelector('[data-deck]')!;
    this.hintEl = this.root.querySelector('[data-hint]')!;
    this.levelEl = this.root.querySelector('[data-level]')!;
  }

  setLevel(n: number) {
    this.levelEl.textContent = String(n);
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
          <button class="btn" data-action>${win ? 'Next level' : 'Try again'}</button>
        </div>
      </div>`;
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
