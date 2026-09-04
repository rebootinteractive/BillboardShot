export interface HudCallbacks {
  onRestart(): void;
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly tilesEl: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly deckEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private modalEl: HTMLDivElement | null = null;
  private hintTimer = 0;

  constructor(parent: HTMLElement, private readonly cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hud-layer';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-stat"><span class="lbl">Pixels</span><strong data-tiles>0</strong></div>
        <div class="hud-stat"><span class="lbl">Deck</span><strong data-deck>0/0</strong></div>
        <div class="hud-stat"><span class="lbl">Shooters</span><strong data-ammo>0</strong></div>
      </div>
      <div class="hud-hint" data-hint></div>
    `;
    parent.appendChild(this.root);
    this.tilesEl = this.root.querySelector('[data-tiles]')!;
    this.ammoEl = this.root.querySelector('[data-ammo]')!;
    this.deckEl = this.root.querySelector('[data-deck]')!;
    this.hintEl = this.root.querySelector('[data-hint]')!;
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
          <button class="btn" data-restart>Play again</button>
        </div>
      </div>`;
    el.querySelector('[data-restart]')!.addEventListener('click', () => {
      this.dismiss();
      this.cb.onRestart();
    });
    this.root.parentElement!.appendChild(el);
    this.modalEl = el;
  }

  dismiss() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  dispose() {
    this.dismiss();
    this.root.remove();
  }
}
