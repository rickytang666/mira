import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { analyzeTranscript } from '../../agent/synthesizeInterview';
import { suggestQuestions } from '../../agent/suggestQuestions';
import { synthesizeReport } from '../../agent/synthesizeReport';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env.server', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

/** Local test bench only. Production actions must use Track 1's auth + study ownership. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  oxc: { jsx: { runtime: 'automatic' } },
  server: { host: '127.0.0.1', port: 3014, strictPort: true },
  plugins: [{ name: 'agent-preview', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!['/api/analyze', '/api/questions', '/api/report'].includes(req.url ?? '')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required.' })); return; }
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Local preview only.' })); return; }
      try {
        let data = '';
        for await (const chunk of req) { data += chunk; if (data.length > 180_000) throw new Error('Input is too large.'); }
        const input = JSON.parse(data);
        const result = req.url === '/api/report' ? await synthesizeReport(input) : req.url === '/api/analyze' ? await analyzeTranscript(input) : await suggestQuestions(input);
        res.end(JSON.stringify(result));
      } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed.' })); }
    });
  } }],
});
