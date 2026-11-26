-- Mercado Jesi | Schema inicial
-- Execute no SQL Editor do Supabase. Revise e aplique em projeto novo.
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','admin','manager','operator','customer');
create type public.product_unit as enum ('un','kg','g','l','ml','pack');
create type public.order_status as enum ('pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'customer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  sku text unique,
  barcode text unique,
  name text not null,
  slug text not null unique,
  description text,
  unit public.product_unit not null default 'un',
  price numeric(12,2) not null check (price >= 0),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(12,3) not null default 0 check (minimum_quantity >= 0),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  movement_type text not null check (movement_type in ('in','out','adjustment','sale','return')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  recipient text not null,
  postal_code text,
  street text not null,
  number text not null,
  complement text,
  neighborhood text,
  city text,
  state text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid references public.customers(id) on delete set null,
  status public.order_status not null default 'pending',
  fulfillment text not null check (fulfillment in ('delivery','pickup')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  customer_name text not null,
  customer_phone text not null,
  delivery_address jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit public.product_unit not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('pix','cash','card','other')),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  amount numeric(12,2) not null check (amount >= 0),
  provider_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  usage_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles(id),
  closed_by uuid references public.profiles(id),
  opening_amount numeric(12,2) not null default 0,
  closing_amount numeric(12,2),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id),
  transaction_type text not null check (transaction_type in ('sale','expense','withdrawal','deposit')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text,
  order_id uuid references public.orders(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  paid_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index products_active_name_idx on public.products(active, name);
create index products_category_idx on public.products(category_id);
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status);
create index stock_movements_product_date_idx on public.stock_movements(product_id, created_at desc);

-- Profile created automatically for each new Auth user. New users are customers by default.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''), 'customer');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and active = true
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('owner','admin','manager','operator'), false)
$$;

-- Public catalog view: exposes only fields required by the storefront.
-- Drop first so an older image_url column can be replaced by image_path.
drop view if exists public.storefront_products;
create view public.storefront_products as
select p.id, p.name, p.slug, p.description, p.unit, p.price,
       c.name as category_name,
       (coalesce(i.quantity,0) > 0) as available,
       (select pi.storage_path
          from public.product_images pi
         where pi.product_id = p.id order by pi.sort_order limit 1) as image_path
from public.products p
left join public.categories c on c.id = p.category_id
left join public.inventory i on i.product_id = p.id
where p.active = true;

-- Storage bucket for product images. Upload permissions are configured separately.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Enable RLS on all application tables.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.coupons enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.expenses enable row level security;

-- Public read access only for active catalog data. The view exposes availability, never raw stock quantities.
create policy "Public reads active categories" on public.categories for select using (active = true);
create policy "Public reads active products" on public.products for select using (active = true);
create policy "Public reads product images" on public.product_images for select using (
  exists (select 1 from public.products p where p.id = product_id and p.active = true)
);
create policy "Public reads brands" on public.brands for select using (true);

-- Staff policies. Authorization comes from profiles, never from client-supplied role metadata.
create policy "Staff manages profiles" on public.profiles for all using (public.current_app_role() in ('owner','admin')) with check (public.current_app_role() in ('owner','admin'));
create policy "User reads own profile" on public.profiles for select using (id = (select auth.uid()));
create policy "Staff manages categories" on public.categories for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages brands" on public.brands for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages products" on public.products for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages product images" on public.product_images for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages inventory" on public.inventory for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff reads stock movements" on public.stock_movements for select using (public.is_staff());
create policy "Staff manages stock movements" on public.stock_movements for insert with check (public.is_staff());
create policy "Staff manages suppliers" on public.suppliers for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages customers" on public.customers for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages addresses" on public.addresses for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages orders" on public.orders for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages order items" on public.order_items for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages payments" on public.payments for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages coupons" on public.coupons for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages cash registers" on public.cash_registers for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages cash transactions" on public.cash_transactions for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff manages expenses" on public.expenses for all using (public.is_staff()) with check (public.is_staff());

-- Customers can read only their own customer record, addresses and orders.
create policy "Customer reads own customer record" on public.customers for select using (
  profile_id = (select auth.uid())
);
create policy "Customer manages own addresses" on public.addresses for all using (
  exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = (select auth.uid()))
) with check (
  exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = (select auth.uid()))
);
create policy "Customer reads own orders" on public.orders for select using (
  exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = (select auth.uid()))
);
create policy "Customer reads own order items" on public.order_items for select using (
  exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
          where o.id = order_id and c.profile_id = (select auth.uid()))
);
create policy "Customer reads own payments" on public.payments for select using (
  exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
          where o.id = order_id and c.profile_id = (select auth.uid()))
);

-- Only staff can upload/update files in the product image bucket.
create policy "Public reads product image files" on storage.objects for select using (bucket_id = 'product-images');
create policy "Staff uploads product image files" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_staff());
create policy "Staff updates product image files" on storage.objects for update using (bucket_id = 'product-images' and public.is_staff());
create policy "Staff deletes product image files" on storage.objects for delete using (bucket_id = 'product-images' and public.is_staff());

-- Important: checkout and stock mutation will be implemented through a transactional RPC/Edge Function
-- in a later migration. Do not allow browser clients to directly create paid orders or decrement stock.
