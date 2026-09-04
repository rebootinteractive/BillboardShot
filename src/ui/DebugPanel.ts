import { FIELDS, DEFAULT_SETTINGS, saveSettings, clearSettings, type Settings } from '../shared/settings';
import { SHAPES } from '../game/shapes';

export interface DebugCallbacks {
  /** structural = the level needs rebuilding; otherwise apply live. */
  onChange(structural: boolean): void;
  onRestart(): void;
}

/**
 * Right-hand drawer of sliders over every tunable. Mutates the live Settings
 * object in place and writes it to localStorage on every change.
 */
export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly rows = new Map<string, { input: HTMLInputElement; out: HTMLElement }>();
  private open = false;

  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
    private readonly cb: DebugCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'dbg-layer';

    this.toggle = document.createElement('button');
    this.toggle.className = 'dbg-toggle';
    this.toggle.textContent = 'Tune';
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));
    this.root.appendChild(this.toggle);

    this.panel = document.createElement('div');
    this.panel.className = 'dbg-panel';
    this.root.appendChild(this.panel);

    const head = document.createElement('div');
    head.className = 'dbg-head';
    head.innerHTML = `<span>Tuning</span>`;
    const close = document.createElement('button');
    close.className = 'dbg-x';
    close.textContent = '×';
    close.addEventListener('click', () => this.setOpen(false));
    head.appendChild(close);
    this.panel.appendChild(head);

    const body = document.createElement('div');
    body.className = 'dbg-body';
    this.panel.appendChild(body);

    body.appendChild(this.buildShapeGroup());

    let currentGroup = '';
    let groupEl: HTMLDivElement | null = null;
    for (const f of FIELDS) {
      if (f.group !== currentGroup) {
        currentGroup = f.group;
        groupEl = document.createElement('div');
        groupEl.className = 'dbg-group';
        groupEl.innerHTML = `<div class="dbg-group-title">${f.group}</div>`;
        body.appendChild(groupEl);
      }
      const row = document.createElement('label');
      row.className = 'dbg-row';
      const decimals = f.step < 1 ? String(f.step).split('.')[1]?.length ?? 1 : 0;
      row.innerHTML = `<span class="dbg-label">${f.label}</span><output class="dbg-out"></output>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(f.min);
      input.max = String(f.max);
      input.step = String(f.step);
      input.value = String(this.settings[f.key]);
      const out = row.querySelector('.dbg-out') as HTMLElement;
      out.textContent = Number(this.settings[f.key]).toFixed(decimals);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        (this.settings[f.key] as number) = v;
        out.textContent = v.toFixed(decimals);
        saveSettings(this.settings);
        this.cb.onChange(!!f.structural);
      });
      row.appendChild(input);
      this.rows.set(f.key, { input, out });
      groupEl!.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'dbg-actions';
    const restart = document.createElement('button');
    restart.className = 'btn small';
    restart.textContent = 'Restart level';
    restart.addEventListener('click', () => this.cb.onRestart());
    const reset = document.createElement('button');
    reset.className = 'btn small ghost';
    reset.textContent = 'Reset defaults';
    reset.addEventListener('click', () => {
      clearSettings();
      Object.assign(this.settings, structuredClone(DEFAULT_SETTINGS));
      this.syncInputs();
      saveSettings(this.settings);
      this.cb.onChange(true);
    });
    actions.append(restart, reset);
    body.appendChild(actions);

    parent.appendChild(this.root);
  }

  private buildShapeGroup(): HTMLDivElement {
    const g = document.createElement('div');
    g.className = 'dbg-group';
    g.innerHTML = `<div class="dbg-group-title">Shapes in play</div>`;
    const chips = document.createElement('div');
    chips.className = 'dbg-chips';
    for (const shape of SHAPES) {
      const chip = document.createElement('button');
      chip.className = 'dbg-chip';
      chip.textContent = shape.name;
      const sync = () => chip.classList.toggle('on', this.settings.shapes.includes(shape.id));
      sync();
      chip.addEventListener('click', () => {
        const i = this.settings.shapes.indexOf(shape.id);
        if (i >= 0) {
          if (this.settings.shapes.length === 1) return; // keep at least one
          this.settings.shapes.splice(i, 1);
        } else {
          this.settings.shapes.push(shape.id);
        }
        sync();
        saveSettings(this.settings);
        this.cb.onChange(true);
      });
      chips.appendChild(chip);
    }
    g.appendChild(chips);
    return g;
  }

  private syncInputs() {
    for (const f of FIELDS) {
      const row = this.rows.get(f.key);
      if (!row) continue;
      const v = Number(this.settings[f.key]);
      row.input.value = String(v);
      const decimals = f.step < 1 ? String(f.step).split('.')[1]?.length ?? 1 : 0;
      row.out.textContent = v.toFixed(decimals);
    }
    this.root.querySelectorAll<HTMLButtonElement>('.dbg-chip').forEach((chip, i) => {
      chip.classList.toggle('on', this.settings.shapes.includes(SHAPES[i].id));
    });
  }

  setOpen(open: boolean) {
    this.open = open;
    this.panel.classList.toggle('open', open);
    this.toggle.classList.toggle('hidden', open);
  }

  dispose() {
    this.root.remove();
  }
}
