import { defineConfig, normalizePath, type Plugin } from 'vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TUNING_FILE = normalizePath(fileURLToPath(new URL('./src/shared/defaults.json', import.meta.url)));

/**
 * Dev-only endpoint the editor panel posts to, so dragging a slider writes the
 * committed tuning file directly. Never registered for a build (`apply: 'serve'`),
 * and the path it writes is fixed here rather than taken from the request.
 */
function tuningWriter(): Plugin {
  // What the editor itself last wrote. A change on disk matching this is our own
  // write and is ignored; anything else — a hand edit, or checking out another
  // branch — reloads the page, so the running game never serves a stale file.
  let lastWritten: string | null = null;

  return {
    name: 'billboardshot-tuning-writer',
    apply: 'serve',
    async handleHotUpdate(ctx) {
      if (normalizePath(ctx.file) !== TUNING_FILE) return;
      if ((await ctx.read()) === lastWritten) return [];
      ctx.server.ws.send({ type: 'full-reload' });
      return [];
    },
    configureServer(server) {
      server.middlewares.use('/__settings', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              throw new Error('not a settings object');
            }
            const text = `${JSON.stringify(parsed, null, 2)}\n`;
            lastWritten = text;
            await writeFile(TUNING_FILE, text, 'utf8');
            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 400;
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [tuningWriter()],
  server: { port: 5173 },
  build: { target: 'es2022' },
});
