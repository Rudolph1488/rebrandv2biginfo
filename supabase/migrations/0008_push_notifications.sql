-- 1. Track each member's notification permission status in organization_members
alter table public.organization_members
  add column if not exists push_permission text not null default 'default'
    check (push_permission in ('default', 'granted', 'denied', 'unsupported')),
  add column if not exists push_updated_at timestamptz;

-- 2. Store Web Push VAPID device subscriptions per user/org
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subs_org_active
  on public.push_subscriptions(org_id, user_id)
  where is_active = true;

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Org admins can view org push subscriptions" on public.push_subscriptions;
create policy "Org admins can view org push subscriptions"
  on public.push_subscriptions for select
  using (public.is_org_admin(org_id));

-- 3. Notification history / queue foundation
create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  body text,
  url text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_logs_org_created
  on public.notification_logs(org_id, created_at desc);

alter table public.notification_logs enable row level security;

drop policy if exists "Users can view own notifications or admins view org notifications" on public.notification_logs;
create policy "Users can view own notifications or admins view org notifications"
  on public.notification_logs for select
  using (user_id = auth.uid() or public.is_org_admin(org_id));
