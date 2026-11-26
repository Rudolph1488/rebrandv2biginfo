-- Ensure print_options permissions are granted to authenticated and service_role
grant all on table public.print_options to authenticated, service_role;

-- Add DTF roll calculator settings to organizations
alter table public.organizations
  add column if not exists dtf_settings jsonb not null default '{
    "roll_width_cm": 58,
    "price_per_meter": 350,
    "gap_cm": 1,
    "press_cost_per_print": 15,
    "markup_multiplier": 2.5
  }'::jsonb;
