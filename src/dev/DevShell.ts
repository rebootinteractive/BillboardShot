import './dev.css';
import type { GameApp } from '../game/GameApp';
import { EditorPanel } from './EditorPanel';

const PHONE_W = 393;
const PHONE_H = 852;

/**
 * Local development layout: the phone exactly as it ships on the left, the editor
 * beside it on the right. The phone is never restyled — it keeps its true pixel
 * size and only gets scaled to fit a short window, so what is on screen here is
 * what a visitor to the deployed link sees.
 */
export function mountDevShell(game: GameApp) {
  const phone = document.getElementById('phone');
  if (!phone) return () => {};

  document.body.classList.add('dev');

  const stage = document.createElement('div');
  stage.id = 'phone-stage';
  phone.parentElement?.insertBefore(stage, phone);
  stage.appendChild(phone);

  const panelEl = document.createElement('aside');
  panelEl.id = 'editor';
  document.body.appendChild(panelEl);

  const panel = new EditorPanel(panelEl, game.settings, {
    onChange: (structural) => game.applySettingsChange(structural),
    onRestart: () => game.restart(),
  });

  const fit = () => {
    const scale = Math.min(1, (window.innerHeight - 40) / PHONE_H);
    phone.style.transform = `scale(${scale})`;
    phone.style.transformOrigin = 'top left';
    stage.style.width = `${PHONE_W * scale}px`;
    stage.style.height = `${PHONE_H * scale}px`;
  };
  fit();
  window.addEventListener('resize', fit);

  return () => {
    window.removeEventListener('resize', fit);
    panel.dispose();
    panelEl.remove();
    document.body.classList.remove('dev');
  };
}
