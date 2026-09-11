import { GameApp } from './game/GameApp';

const app = document.getElementById('app')!;
let game: GameApp | undefined;
let unmountDevShell: (() => void) | undefined;

function start() {
  unmountDevShell?.();
  unmountDevShell = undefined;
  game?.dispose();
  game = new GameApp(app);

  // Local only. `import.meta.env.DEV` is substituted at build time, so the whole
  // branch — and the editor chunk it pulls in — is dropped from the deployed bundle.
  if (import.meta.env.DEV) {
    void import('./dev/DevShell').then(({ mountDevShell }) => {
      if (game) unmountDevShell = mountDevShell(game);
    });
  }
}

start();

// Vite HMR: tear the old app down cleanly instead of stacking canvases.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unmountDevShell?.();
    game?.dispose();
  });
}
