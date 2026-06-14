import { supabase } from './supabase';

/**
 * Subscribe the user to Web Push via the active service worker.
 * Requires VITE_VAPID_PUBLIC_KEY in .env (generate with web-push / Supabase Edge Function).
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function subscribeToWebPush() {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!isPushSupported()) {
    return { subscription: null, error: 'Bu tarayıcı web push bildirimlerini desteklemiyor.' };
  }

  if (!vapidPublicKey) {
    return {
      subscription: null,
      error: 'Bildirim ayarları henüz yapılandırılmamış. Kreş yöneticinize bildirin.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { subscription: null, error: 'Bildirim izni verilmedi.' };
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { subscription: null, error: 'Oturum bulunamadı. Lütfen tekrar giriş yapın.' };
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ web_push_subscription: subscription.toJSON() })
      .eq('id', user.id);

    if (updateError) {
      return {
        subscription: null,
        error: 'Bildirim tercihiniz kaydedilemedi. Lütfen tekrar deneyin.',
      };
    }

    return { subscription, error: null };
  } catch (error) {
    return { subscription: null, error };
  }
}

export async function unsubscribeFromWebPush() {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const unsubscribed = await subscription.unsubscribe();

  if (unsubscribed) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('profiles')
        .update({ web_push_subscription: null })
        .eq('id', user.id);
    }
  }

  return unsubscribed;
}
