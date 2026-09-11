import { defineConfig, type Plugin } from 'vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TUNING_FILE = fileURLToPath(new URL('./src/shared/defaults.json', import.meta.url));

/**
 * Dev-only endpoint the editor panel posts to, so dragging a slider writes the
 * committed tuning file directly. Never registered for a build (`apply: 'serve'`),
 * and the path it writes is fixed here rather than taken from the request.
 */
function tuningWriter(): Plugin {
  return {
    name: 'billboardshot-tuning-writer',
    apply: 'serve',
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
            if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.shapes)) {
              throw new Error('not a settings object');
            }
            await writeFile(TUNING_FILE, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
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
  server: {
    port: 5173,
    // The editor writes this file constantly; reloading the page on every slider
    // drag would be unusable, and the values are already live in memory.
    watch: { ignored: ['**/src/shared/defaults.json'] },
  },
  build: { target: 'es2022' },
});
