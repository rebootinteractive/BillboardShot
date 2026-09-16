import './gallery.css';
import { COLOR_CSS } from '../shared/colors';
import type { ColorKey } from '../shared/types';
import { PICTURES, validatePicture, PICTURE_FILES, type Picture, type PictureStatus } from '../art/library';
import { analyzePicture } from '../art/analyze';

/** Distinct neutral-ish hues for showing group ids instead of colors. */
const GROUP_HUES = ['#e8a33d', '#4f8fd6', '#5bb974', '#d65f8a', '#8e6cd6', '#39b3b0', '#c97b4a', '#8a9a3a', '#b0b0b0'];

type Filter = 'all' | PictureStatus;
type OriginFilter = 'any' | 'drawn' | 'converted';

/**
 * Local review page for the art library (`?gallery`). Shows every picture with its
 * computed facts, and saves approve/reject decisions straight to the picture files.
 */
export function mountGallery(root: HTMLElement) {
  document.body.classList.add('gallery-mode');
  root.className = 'gl-scroll';
  root.innerHTML = '';
  const pictures = [...PICTURES.values()].map((p) => ({ ...p }));
  let filter: Filter = 'all';
  let origin: OriginFilter = 'any';
  let showGroups = false;
  /** Preview color per picture per group, starting from the first suggestion. */
  const chosen = new Map<string, Record<string, ColorKey>>();
  for (const p of pictures) chosen.set(p.id, Object.fromEntries(Object.entries(p.groups).map(([g, d]) => [g, d.suggest[0]])));

  const page = document.createElement('div');
  page.className = 'gl-page';
  root.appendChild(page);

  const render = () => {
    const counts = { draft: 0, approved: 0, rejected: 0 };
    for (const p of pictures) counts[p.status]++;
    page.innerHTML = `
      <header class="gl-head">
        <h1>Art library</h1>
        <p class="gl-sub">${pictures.length} pictures · ${counts.approved} approved · ${counts.draft} draft · ${counts.rejected} rejected</p>
        <div class="gl-controls">
          ${(['all', 'draft', 'approved', 'rejected'] as Filter[]).map((f) => `<button class="gl-chip ${f === filter ? 'on' : ''}" data-filter="${f}">${f}</button>`).join('')}
          <span class="gl-sep"></span>
          ${(['any', 'drawn', 'converted'] as OriginFilter[]).map((o) => `<button class="gl-chip ${o === origin ? 'on' : ''}" data-origin="${o}">${o === 'any' ? 'any origin' : o}</button>`).join('')}
          <span class="gl-sep"></span>
          <button class="gl-chip ${showGroups ? 'on' : ''}" data-groups>Show group numbers</button>
        </div>
      </header>
      <main class="gl-grid"></main>`;
    page.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter as Filter; render(); }));
    page.querySelectorAll<HTMLButtonElement>('[data-origin]').forEach((b) => b.addEventListener('click', () => { origin = b.dataset.origin as OriginFilter; render(); }));
    page.querySelector('[data-groups]')!.addEventListener('click', () => { showGroups = !showGroups; render(); });
    const grid = page.querySelector('.gl-grid')!;
    for (const p of pictures) {
      if (filter !== 'all' && p.status !== filter) continue;
      if (origin !== 'any' && p.origin?.method !== origin) continue;
      grid.appendChild(card(p));
    }
  };

  const card = (p: Picture) => {
    const facts = analyzePicture(p);
    const errors = validatePicture(p, PICTURE_FILES.get(p.id));
    const colors = chosen.get(p.id)!;
    const el = document.createElement('article');
    el.className = `gl-card ${p.status}`;
    const cells = p.art.flatMap((row) => [...row].map((ch) => {
      if (ch === '.') return '<i></i>';
      const bg = showGroups ? GROUP_HUES[(Number(ch) - 1) % GROUP_HUES.length] : COLOR_CSS[colors[ch]];
      return `<i class="px" style="background:${bg}">${showGroups ? ch : ''}</i>`;
    })).join('');
    el.innerHTML = `
      <div class="gl-title">
        <div><h2>${p.name}</h2><span class="gl-id">${p.id} · ${facts.width}×${facts.height} · ${facts.pixels} px · ${p.origin?.method === 'converted' ? `converted from <a href="${p.origin.url}" target="_blank">${p.origin.source}</a>` : 'drawn'}</span></div>
        <span class="gl-status ${p.status}">${p.status}</span>
      </div>
      <div class="gl-tags">${p.tags.map((t) => `<span>${t}</span>`).join('')}</div>
      <div class="gl-art" style="grid-template-columns:repeat(${facts.width}, var(--cell));width:calc(${facts.width} * var(--cell) + ${facts.width - 1} * 2px + 16px)">${cells}</div>
      ${errors.length ? `<ul class="gl-errors">${errors.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
      <table class="gl-facts">
        <thead><tr><th>#</th><th>Part</th><th>Px</th><th title="Separate pieces">Pcs</th><th title="Pixels at the bottom of a column at the start">Exposed</th><th title="Groups directly beneath it">Rests on</th><th title="Can be hidden without revealing at the start">Mystery</th><th>Colors</th></tr></thead>
        <tbody>${facts.groups.map((g) => `
          <tr>
            <td><span class="gl-dot" style="background:${GROUP_HUES[(Number(g.id) - 1) % GROUP_HUES.length]}">${g.id}</span></td>
            <td>${g.part}</td><td>${g.pixels}</td><td>${g.pieces}</td>
            <td>${g.exposedPixels || '–'}</td>
            <td>${g.restsOn.join(', ') || '–'}</td>
            <td>${g.mysteryCandidate ? '✓' : '–'}</td>
            <td class="gl-suggest">${p.groups[g.id].suggest.map((c) => `<button title="${c}" data-group="${g.id}" data-color="${c}" class="${colors[g.id] === c ? 'on' : ''}" style="background:${COLOR_CSS[c]}"></button>`).join('')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="gl-note-row"><input class="gl-note" placeholder="Note (optional, e.g. why rejected)" value="${(p.note ?? '').replace(/"/g, '&quot;')}"></div>
      <div class="gl-actions">
        <button class="gl-btn approve" data-status="approved">Approve</button>
        <button class="gl-btn reject" data-status="rejected">Reject</button>
        <button class="gl-btn" data-status="draft">Back to draft</button>
        <a class="gl-btn link" href="?art=${p.id}&debug" target="_blank">Play preview</a>
      </div>
      <div class="gl-save"></div>`;
    el.querySelectorAll<HTMLButtonElement>('.gl-suggest button').forEach((b) => b.addEventListener('click', () => {
      colors[b.dataset.group!] = b.dataset.color as ColorKey;
      el.replaceWith(card(p));
    }));
    const note = el.querySelector<HTMLInputElement>('.gl-note')!;
    const saveEl = el.querySelector<HTMLElement>('.gl-save')!;
    el.querySelectorAll<HTMLButtonElement>('[data-status]').forEach((b) => b.addEventListener('click', async () => {
      const status = b.dataset.status as PictureStatus;
      saveEl.textContent = 'Saving…';
      try {
        const res = await fetch('/__art', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, status, note: note.value.trim() }),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        p.status = status;
        p.note = note.value.trim() || undefined;
        render();
      } catch (err) {
        saveEl.textContent = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }));
    return el;
  };

  render();
}
