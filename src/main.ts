import { GameApp } from './game/GameApp';

const app = document.getElementById('app')!;
let current: { dispose(): void } | undefined;

function start() {
  current?.dispose();
  current = new GameApp(app);
}

start();

// Vite HMR: tear the old app down cleanly instead of stacking canvases.
if (import.meta.hot) {
  import.meta.hot.dispose(() => current?.dispose());
}
