-- Store Web Push subscription JSON on each profile (PushSubscription.toJSON() format)

alter table public.profiles
  add column if not exists web_push_subscription jsonb;

comment on column public.profiles.web_push_subscription is
  'Browser Push API subscription object (endpoint + keys) for web push notifications.';

create index if not exists profiles_web_push_subscription_idx
  on public.profiles
  using gin (web_push_subscription)
  where web_push_subscription is not null;
