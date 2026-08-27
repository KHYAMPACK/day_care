import { resolveTenantFromRequest } from './lib/tenant.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tenant = await resolveTenantFromRequest(req);
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).json(tenant);
  } catch (error) {
    console.error('tenant error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
