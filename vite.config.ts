import { defineConfig, normalizePath, type Plugin } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
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

const PICTURES_DIR = normalizePath(fileURLToPath(new URL('./src/art/pictures/', import.meta.url)));

/** A picture file in the library's compact layout: one art row per line. */
function formatPicture(p: Record<string, unknown> & { art: string[]; groups: Record<string, { part: string; suggest: string[] }> }) {
  const j = JSON.stringify;
  const list = (a: unknown[]) => j(a).replace(/,/g, ', ');
  const groups = Object.entries(p.groups)
    .map(([id, g]) => `    ${j(id)}: { "part": ${j(g.part)}, "suggest": ${list(g.suggest)} }`)
    .join(',\n');
  return `{
  "id": ${j(p.id)},
  "name": ${j(p.name)},
  "tags": ${list(p.tags as unknown[])},
  "status": ${j(p.status)},${p.note ? `\n  "note": ${j(p.note)},` : ''}
  "origin": { ${Object.entries(p.origin as Record<string, string>).map(([k, v]) => `${j(k)}: ${j(v)}`).join(', ')} },
  "art": [
${p.art.map((r) => `    ${j(r)}`).join(',\n')}
  ],
  "groups": {
${groups}
  }
}
`;
}

/**
 * Dev-only endpoint for the art gallery's Approve / Reject buttons. It only changes a
 * picture's status and note, in an existing file named by a checked id.
 */
function artReviewWriter(): Plugin {
  const lastWritten = new Map<string, string>();
  return {
    name: 'billboardshot-art-review',
    apply: 'serve',
    async handleHotUpdate(ctx) {
      const file = normalizePath(ctx.file);
      if (!file.startsWith(PICTURES_DIR)) return;
      // The gallery already shows its own change; reloading would lose the scroll position.
      if (lastWritten.get(file) === (await ctx.read())) return [];
    },
    configureServer(server) {
      server.middlewares.use('/__art', (req, res) => {
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
            const { id, status, note } = JSON.parse(body);
            if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('bad id');
            if (!['draft', 'approved', 'rejected'].includes(status)) throw new Error('bad status');
            if (note !== undefined && (typeof note !== 'string' || note.length > 500)) throw new Error('bad note');
            const file = `${PICTURES_DIR}${id}.json`;
            const picture = JSON.parse(await readFile(file, 'utf8'));
            picture.status = status;
            if (note) picture.note = note;
            else delete picture.note;
            const text = formatPicture(picture);
            lastWritten.set(file, text);
            await writeFile(file, text, 'utf8');
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
  plugins: [tuningWriter(), artReviewWriter()],
  server: { port: 5173 },
  build: { target: 'es2022' },
});
