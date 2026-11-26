-- Add production time tracking (active timer + accumulated seconds)
alter table public.orders
  add column if not exists production_elapsed_seconds integer not null default 0,
  add column if not exists production_timer_started_at timestamptz;
