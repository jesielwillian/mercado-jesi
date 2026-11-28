-- Rastreamento GPS de entregas. Execute no SQL Editor do Supabase.
alter type public.app_role add value if not exists 'driver';
create table if not exists public.delivery_tracking (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned','active','paused','completed')),
  started_at timestamptz,
  ended_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_accuracy double precision,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.delivery_tracking_points (
  id bigint generated always as identity primary key,
  tracking_id uuid not null references public.delivery_tracking(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists delivery_tracking_order_idx on public.delivery_tracking(order_id);
create index if not exists delivery_tracking_driver_idx on public.delivery_tracking(driver_id,status);
create index if not exists delivery_points_tracking_time_idx on public.delivery_tracking_points(tracking_id,recorded_at desc);
alter table public.delivery_tracking enable row level security;
alter table public.delivery_tracking_points enable row level security;
-- Atribuição e leitura/escrita devem ser feitas por funções/roles administrativas.
-- Não habilitar políticas públicas: admin/driver policies dependem do modelo de permissões da loja.
