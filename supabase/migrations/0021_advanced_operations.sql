-- Operação avançada: compras, lotes, fidelidade e auditoria operacional.
-- Aplicar após 0020. Todas as tabelas administrativas ficam protegidas por RLS.
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  status text not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  expected_at date,
  notes text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  created_by uuid references public.profiles(id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  received_quantity numeric(12,3) not null default 0 check (received_quantity >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  expiry_date date,
  lot_code text,
  created_at timestamptz not null default now()
);
create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  lot_code text,
  quantity_received numeric(12,3) not null check (quantity_received > 0),
  quantity_remaining numeric(12,3) not null check (quantity_remaining >= 0),
  expiry_date date,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists purchase_orders_status_created_idx on public.purchase_orders(status, created_at desc);
create index if not exists purchase_items_order_idx on public.purchase_order_items(purchase_order_id);
create index if not exists inventory_lots_expiry_idx on public.inventory_lots(expiry_date) where quantity_remaining > 0;
create index if not exists inventory_lots_product_idx on public.inventory_lots(product_id, expiry_date);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.inventory_lots enable row level security;
drop policy if exists "Staff manages purchase orders" on public.purchase_orders;
create policy "Staff manages purchase orders" on public.purchase_orders for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff manages purchase order items" on public.purchase_order_items;
create policy "Staff manages purchase order items" on public.purchase_order_items for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff manages inventory lots" on public.inventory_lots;
create policy "Staff manages inventory lots" on public.inventory_lots for all using (public.is_staff()) with check (public.is_staff());

-- Recebimento atômico: atualiza saldo, custo médio e trilha de estoque numa única transação.
create or replace function public.receive_purchase_order(p_purchase_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item record; v_received integer := 0; v_total numeric(12,2) := 0; v_qty numeric(12,3); v_old_qty numeric(12,3); v_old_cost numeric(12,2); v_lot_id uuid;
begin
  if not public.is_staff() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  perform 1 from public.purchase_orders where id = p_purchase_order_id and status in ('draft','sent') for update;
  if not found then raise exception 'Pedido de compra não encontrado ou já recebido.'; end if;
  for v_item in
    select poi.*, p.name from public.purchase_order_items poi
    join public.products p on p.id = poi.product_id
    where poi.purchase_order_id = p_purchase_order_id
    for update of poi
  loop
    v_qty := case when v_item.received_quantity = 0 then v_item.quantity else v_item.received_quantity end;
    if v_qty > v_item.quantity then raise exception 'Quantidade recebida excede a solicitada.'; end if;
    if v_qty > 0 then
      select coalesce(quantity,0) into v_old_qty from public.inventory where product_id = v_item.product_id for update;
      if not found then v_old_qty := 0; end if;
      select cost_price into v_old_cost from public.products where id = v_item.product_id for update;
      insert into public.inventory(product_id, quantity, minimum_quantity)
      values (v_item.product_id, v_qty, 0)
      on conflict (product_id) do update set quantity = public.inventory.quantity + excluded.quantity, updated_at = now();
      insert into public.stock_movements(product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
      values (v_item.product_id, 'in', v_qty, v_item.unit_cost, 'purchase_order', p_purchase_order_id, 'Recebimento de compra', auth.uid());
      insert into public.inventory_lots(product_id, purchase_order_item_id, quantity_received, quantity_remaining, expiry_date)
      values (v_item.product_id, v_item.id, v_qty, v_qty, v_item.expiry_date) returning id into v_lot_id;
      update public.inventory_lots set lot_code = v_item.lot_code where id = v_lot_id;
      update public.products set cost_price = case when coalesce(v_old_cost,0) > 0 and v_old_qty > 0 then round(((v_old_qty * v_old_cost) + (v_qty * v_item.unit_cost)) / (v_old_qty + v_qty), 2) else v_item.unit_cost end, updated_at = now() where id = v_item.product_id;
      update public.purchase_order_items set received_quantity = v_qty where id = v_item.id;
      v_received := v_received + 1;
      v_total := v_total + (v_qty * v_item.unit_cost);
    end if;
  end loop;
  if v_received = 0 then raise exception 'Informe a quantidade recebida dos itens antes de confirmar.'; end if;
  update public.purchase_orders set status = 'received', received_at = now(), subtotal = v_total, updated_at = now() where id = p_purchase_order_id;
  return jsonb_build_object('success', true, 'items_received', v_received, 'subtotal', v_total);
end;
$$;
revoke all on function public.receive_purchase_order(uuid) from public;
grant execute on function public.receive_purchase_order(uuid) to authenticated;

-- Fidelidade: pontos somente para pedidos concluídos e uma única concessão por pedido.
create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  points_balance integer not null default 0 check (points_balance >= 0),
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete set null,
  points integer not null check (points <> 0),
  description text not null,
  created_at timestamptz not null default now()
);
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
drop policy if exists "Staff manages loyalty accounts" on public.loyalty_accounts;
create policy "Staff manages loyalty accounts" on public.loyalty_accounts for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff manages loyalty transactions" on public.loyalty_transactions;
create policy "Staff manages loyalty transactions" on public.loyalty_transactions for all using (public.is_staff()) with check (public.is_staff());
create index if not exists loyalty_transactions_account_date_idx on public.loyalty_transactions(account_id, created_at desc);

create or replace function public.award_order_loyalty_points()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account_id uuid; v_points integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.customer_id is not null then
    v_points := floor(coalesce(new.total,0) / 10)::integer;
    if v_points > 0 then
      insert into public.loyalty_accounts(customer_id) values (new.customer_id)
      on conflict (customer_id) do update set updated_at = now()
      returning id into v_account_id;
      insert into public.loyalty_transactions(account_id, order_id, points, description)
      values (v_account_id, new.id, v_points, 'Pontos por pedido concluído')
      on conflict (order_id) do nothing;
      if found then
        update public.loyalty_accounts set points_balance = points_balance + v_points,
          lifetime_points = lifetime_points + v_points, updated_at = now() where id = v_account_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_award_loyalty_points on public.orders;
create trigger orders_award_loyalty_points after update of status on public.orders
for each row execute function public.award_order_loyalty_points();


-- Habilita eventos de pedidos para o quadro ao vivo, sem falhar se já estiver publicado.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

-- Baixa FIFO dos lotes rastreados quando o estoque sai por venda/perda.
-- Saldo legado sem lote permanece no estoque geral, sem bloquear uma venda válida.
create or replace function public.consume_inventory_lots_fifo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_remaining numeric(12,3) := new.quantity; v_lot record; v_take numeric(12,3);
begin
  if new.movement_type not in ('sale','out') then return new; end if;
  for v_lot in
    select id, quantity_remaining from public.inventory_lots
    where product_id = new.product_id and quantity_remaining > 0
    order by expiry_date asc nulls last, received_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.quantity_remaining);
    update public.inventory_lots set quantity_remaining = quantity_remaining - v_take where id = v_lot.id;
    v_remaining := v_remaining - v_take;
  end loop;
  return new;
end;
$$;
drop trigger if exists stock_movement_consume_lots on public.stock_movements;
create trigger stock_movement_consume_lots after insert on public.stock_movements
for each row execute function public.consume_inventory_lots_fifo();
