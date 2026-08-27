import path from 'node:path';

const API_FILES = {
  '/api/send-push': { file: 'send-push.js', methods: ['POST'] },
  '/api/cron-calendar-reminders': { file: 'cron-calendar-reminders.js', methods: ['GET', 'POST'] },
};

function attachVercelResponse(res) {
  if (typeof res.status !== 'function') {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
  }

  if (typeof res.json !== 'function') {
    res.json = (body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        const route = API_FILES[url];
        if (!route || !route.methods.includes(req.method)) {
          next();
          return;
        }

        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            req.body = await readJsonBody(req);
          } else {
            req.body = {};
          }
          attachVercelResponse(res);
          const modulePath = path.resolve(server.config.root, 'api', route.file);
          const mod = await server.ssrLoadModule(modulePath);
          await mod.default(req, res);
        } catch (error) {
          console.error('vite api:', url, error);
          if (!res.headersSent) {
            attachVercelResponse(res);
            res.status(500).json({ error: error.message ?? 'API hatası' });
          }
        }
      });
    },
  };
}
