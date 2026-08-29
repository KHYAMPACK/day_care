import { buildManifest, getRequestOrigin, resolveTenantFromRequest } from './_lib/tenant.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tenant = await resolveTenantFromRequest(req);
    const origin = getRequestOrigin(req);
    const manifest = buildManifest(tenant, origin);

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).json(manifest);
  } catch (error) {
    console.error('manifest error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
