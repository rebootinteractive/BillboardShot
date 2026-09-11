import {
  FIELDS,
  TOGGLES,
  saveSettings,
  sanitizeSettings,
  onSaveStatus,
  type SaveStatus,
  type Settings,
} from '../shared/settings';
import { SHAPES } from '../game/shapes';

export interface EditorCallbacks {
  /** structural = the level needs rebuilding; otherwise apply live. */
  onChange(structural: boolean): void;
  onRestart(): void;
}

/**
 * The local development editor. Mutates the live Settings object in place and
 * writes it straight back to src/shared/defaults.json, which is the tuning the
 * deployed build ships. Dev only — never reaches a production bundle.
 */
export class EditorPanel {
  private readonly rows = new Map<string, { input: HTMLInputElement; out: HTMLElement }>();
  private readonly toggleBtns = new Map<string, HTMLButtonElement>();
  private readonly status: HTMLElement;
  /** The tuning as it was on the file when the page loaded, for Revert. */
  private readonly opened: Settings;
  private jsonModal: HTMLDivElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    private readonly cb: EditorCallbacks,
  ) {
    this.opened = { ...settings, shapes: [...settings.shapes] };

    const head = document.createElement('div');
    head.className = 'ed-head';
    head.innerHTML = `<span class="ed-title">Editor</span><span class="ed-status" data-status></span>`;
    root.appendChild(head);
    this.status = head.querySelector('[data-status]') as HTMLElement;
    this.setStatus('saved');
    onSaveStatus((s, detail) => this.setStatus(s, detail));

    const body = document.createElement('div');
    body.className = 'ed-body';
    root.appendChild(body);

    const groupEls = new Map<string, HTMLDivElement>();
    const groupFor = (name: string) => {
      let el = groupEls.get(name);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ed-group';
        el.innerHTML = `<div class="ed-group-title">${name}</div>`;
        body.appendChild(el);
        groupEls.set(name, el);
      }
      return el;
    };

    body.appendChild(this.buildShapeGroup());

    for (const f of FIELDS) {
      const row = document.createElement('label');
      row.className = 'ed-row';
      const decimals = f.step < 1 ? (String(f.step).split('.')[1]?.length ?? 1) : 0;
      row.innerHTML = `<span class="ed-label">${f.label}</span><output class="ed-out"></output>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(f.min);
      input.max = String(f.max);
      input.step = String(f.step);
      input.value = String(this.settings[f.key]);
      const out = row.querySelector('.ed-out') as HTMLElement;
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
      groupFor(f.group).appendChild(row);
    }

    for (const t of TOGGLES) {
      const row = document.createElement('div');
      row.className = 'ed-row ed-toggle-row';
      row.innerHTML = `<span class="ed-label">${t.label}</span>`;
      const btn = document.createElement('button');
      btn.className = 'ed-chip';
      const sync = () => {
        const on = this.settings[t.key];
        btn.classList.toggle('on', on);
        btn.textContent = on ? 'On' : 'Off';
      };
      sync();
      btn.addEventListener('click', () => {
        this.settings[t.key] = !this.settings[t.key];
        sync();
        saveSettings(this.settings);
        this.cb.onChange(!!t.structural);
      });
      row.appendChild(btn);
      this.toggleBtns.set(t.key, btn);
      groupFor(t.group).appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'ed-actions';
    actions.append(
      this.button('Restart level', 'btn small', () => this.cb.onRestart()),
      this.button('Revert', 'btn small ghost', () => {
        Object.assign(this.settings, { ...this.opened, shapes: [...this.opened.shapes] });
        this.syncInputs();
        saveSettings(this.settings);
        this.cb.onChange(true);
      }),
      this.button('Tuning JSON', 'btn small ghost', () => this.openJsonModal()),
    );
    body.appendChild(actions);
  }

  private button(label: string, className: string, onClick: () => void) {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private setStatus(s: SaveStatus, detail?: string) {
    const text =
      s === 'saving' ? 'saving…' : s === 'saved' ? 'saved to defaults.json' : `save failed — ${detail ?? ''}`;
    this.status.textContent = text;
    this.status.classList.toggle('bad', s === 'failed');
  }

  private buildShapeGroup(): HTMLDivElement {
    const g = document.createElement('div');
    g.className = 'ed-group';
    g.innerHTML = `<div class="ed-group-title">Shapes in play</div>`;
    const chips = document.createElement('div');
    chips.className = 'ed-chips';
    for (const shape of SHAPES) {
      const chip = document.createElement('button');
      chip.className = 'ed-chip';
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

  /** Read the tuning out to share, or paste one in to apply it. */
  private openJsonModal() {
    this.closeJsonModal();
    const el = document.createElement('div');
    el.className = 'modal ed-modal';
    el.innerHTML = `
      <div class="modal-card">
        <h2>Tuning JSON</h2>
        <p>This is what lives in src/shared/defaults.json. Paste one in and hit Apply to load it.</p>
        <textarea class="json" spellcheck="false"></textarea>
        <div class="ed-modal-status" data-status></div>
        <div class="modal-actions">
          <button class="btn small ghost" data-copy>Copy</button>
          <button class="btn small" data-apply>Apply</button>
          <button class="btn small ghost" data-close>Close</button>
        </div>
      </div>`;

    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    const status = el.querySelector('[data-status]') as HTMLElement;
    ta.value = JSON.stringify(this.settings, null, 2);
    const say = (msg: string, bad = false) => {
      status.textContent = msg;
      status.classList.toggle('bad', bad);
    };

    el.querySelector('[data-copy]')!.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        say('Copied to clipboard.');
      } catch {
        ta.select();
        say('Selected — press Cmd/Ctrl+C to copy.');
      }
    });

    el.querySelector('[data-apply]')!.addEventListener('click', () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ta.value);
      } catch {
        say('That is not valid JSON.', true);
        return;
      }
      const clean = sanitizeSettings(parsed, SHAPES.map((sh) => sh.id));
      if (!clean) {
        say('No recognisable tuning values in there.', true);
        return;
      }
      Object.assign(this.settings, clean);
      saveSettings(this.settings);
      this.syncInputs();
      this.cb.onChange(true);
      say('Applied and written to defaults.json.');
    });

    el.querySelector('[data-close]')!.addEventListener('click', () => this.closeJsonModal());
    document.body.appendChild(el);
    this.jsonModal = el;
  }

  private closeJsonModal() {
    this.jsonModal?.remove();
    this.jsonModal = null;
  }

  private syncInputs() {
    for (const f of FIELDS) {
      const row = this.rows.get(f.key);
      if (!row) continue;
      const v = Number(this.settings[f.key]);
      row.input.value = String(v);
      const decimals = f.step < 1 ? (String(f.step).split('.')[1]?.length ?? 1) : 0;
      row.out.textContent = v.toFixed(decimals);
    }
    this.root.querySelectorAll<HTMLButtonElement>('.ed-chips .ed-chip').forEach((chip, i) => {
      chip.classList.toggle('on', this.settings.shapes.includes(SHAPES[i].id));
    });
    for (const t of TOGGLES) {
      const btn = this.toggleBtns.get(t.key);
      if (!btn) continue;
      const on = this.settings[t.key];
      btn.classList.toggle('on', on);
      btn.textContent = on ? 'On' : 'Off';
    }
  }

  dispose() {
    onSaveStatus(null);
    this.closeJsonModal();
    this.root.replaceChildren();
  }
}
