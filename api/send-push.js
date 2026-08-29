import { createClient } from '@supabase/supabase-js';
import {
  buildPushItems,
  fetchSubscriptionRows,
  getSupabaseAdmin,
  sendWebPushItems,
} from './_lib/webPush.js';
import {
  buildPushIconUrl,
  buildTenantPayload,
  fetchSchoolBrandingById,
  getRequestOrigin,
} from './_lib/tenant.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase is not configured on the server' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (profileError || !['teacher', 'director'].includes(profile?.role)) {
      return res.status(403).json({ error: 'Only teachers and directors can send push notifications' });
    }

    const { title: clientTitle, items: clientItems, delivery } = req.body ?? {};
    const tenant = profile.school_id
      ? await fetchSchoolBrandingById(profile.school_id)
      : buildTenantPayload(null);
    const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
    const pushTitle = clientTitle ?? tenant.name;
    const pushIcon = buildPushIconUrl(origin, tenant);

    let items = Array.isArray(clientItems) ? clientItems : [];

    if (delivery) {
      const { adminDb } = getSupabaseAdmin();
      const subscriptionRows = await fetchSubscriptionRows(adminDb, delivery);
      items = buildPushItems(subscriptionRows, {
        ...delivery,
        tag: 'daycare-notification',
      });
    }

    if (!items.length) {
      return res.status(200).json({
        sent: 0,
        failed: 0,
        total: 0,
        skipped: true,
        message: 'No push subscriptions matched this message target',
      });
    }

    const result = await sendWebPushItems(items, {
      title: pushTitle,
      icon: pushIcon,
      tag: 'daycare-notification',
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('send-push error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
