import { getRequestOrigin, renderTenantIconPng, resolveTenantFromRequest } from '../_lib/tenant.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = new URL(req.url ?? '/', getRequestOrigin(req) ?? 'http://localhost');
    const size = url.searchParams.get('size') ?? '192';
    const tenant = await resolveTenantFromRequest(req);
    const png = await renderTenantIconPng(tenant, size);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.status(200).end(png);
  } catch (error) {
    console.error('branding icon error:', error);
    return res.status(400).json({ error: error.message ?? 'Invalid icon request' });
  }
}
