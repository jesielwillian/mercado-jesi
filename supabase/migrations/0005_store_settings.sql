-- Mercado Jesi | Migration 0005: configurações públicas da loja
create table if not exists public.store_settings (
  id boolean primary key default true check (id = true),
  store_name text not null default 'Mercado Jesi',
  document text,
  email text,
  phone text,
  whatsapp text,
  address text,
  opening_hours text,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  free_delivery_minimum numeric(12,2) not null default 0 check (free_delivery_minimum >= 0),
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.store_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists "Public reads store settings" on public.store_settings;
create policy "Public reads store settings"
on public.store_settings for select
to anon, authenticated
using (true);

drop policy if exists "Staff manages store settings" on public.store_settings;
create policy "Staff manages store settings"
on public.store_settings for all
to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

grant select on public.store_settings to anon, authenticated;
grant insert, update, delete on public.store_settings to authenticated;
