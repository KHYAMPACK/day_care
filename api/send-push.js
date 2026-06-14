import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

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
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can send push notifications' });
    }

    const publicKey =
      process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@kres-takip.local';

    if (!publicKey || !privateKey) {
      return res.status(500).json({
        error: 'VAPID keys are not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.',
      });
    }

    const { title = '🌸 Kreş Takip', items } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No push notifications to send' });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const results = await Promise.allSettled(
      items.map(({ subscription, body, url = '/' }) => {
        if (!subscription?.endpoint) {
          return Promise.reject(new Error('Invalid subscription'));
        }

        const payload = JSON.stringify({
          title,
          body,
          url,
          tag: 'daycare-notification',
        });

        return webpush.sendNotification(subscription, payload);
      })
    );

    const sent = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - sent;

    return res.status(200).json({ sent, failed, total: results.length });
  } catch (error) {
    console.error('send-push error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
