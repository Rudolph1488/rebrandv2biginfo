-- ============================================================================
-- CENTRUM CRM v2 — Migration 0004: Order Item Attributes (Size, Color, Options)
-- ============================================================================

alter table public.order_items
  add column if not exists attributes jsonb not null default '{}'::jsonb;
