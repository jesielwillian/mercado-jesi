alter table public.stock_movements
  add column if not exists reference_type text;

alter table public.stock_movements
  add column if not exists reference_id uuid;
