import path from 'node:path';

const API_ROUTES = [
  { match: (url) => url === '/api/tenant', file: 'tenant.js', methods: ['GET'] },
  {
    match: (url) => url === '/api/manifest.webmanifest',
    file: 'manifest.webmanifest.js',
    methods: ['GET'],
  },
  {
    match: (url) => url === '/api/branding/icon' || url.startsWith('/api/branding/icon?'),
    file: 'branding/icon.js',
    methods: ['GET'],
  },
  { match: (url) => url === '/api/send-push', file: 'send-push.js', methods: ['POST'] },
  {
    match: (url) => url === '/api/cron-calendar-reminders',
    file: 'cron-calendar-reminders.js',
    methods: ['GET', 'POST'],
  },
];

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

function findRoute(url, method) {
  return API_ROUTES.find((route) => route.match(url) && route.methods.includes(method));
}

export function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        const fullUrl = req.url ?? '';
        const route =
          findRoute(url, req.method) ??
          (req.method === 'GET' ? findRoute(fullUrl.split('?')[0], req.method) : null);

        if (!route) {
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
          console.error('vite api:', fullUrl, error);
          if (!res.headersSent) {
            attachVercelResponse(res);
            res.status(500).json({ error: error.message ?? 'API hatası' });
          }
        }
      });
    },
  };
}
