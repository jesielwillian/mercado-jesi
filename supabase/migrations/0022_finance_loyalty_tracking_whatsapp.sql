-- Mercado Jesi | Financeiro, fidelidade avançada, rastreamento seguro,
-- conciliação, lucratividade e fila de WhatsApp.

alter table public.order_items add column if not exists unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0);

create or replace function public.snapshot_order_item_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_cost is null and new.product_id is not null then
    select cost_price into new.unit_cost from public.products where id = new.product_id;
  end if;
  return new;
end;
$$;
drop trigger if exists order_items_snapshot_cost on public.order_items;
create trigger order_items_snapshot_cost before insert on public.order_items
for each row execute function public.snapshot_order_item_cost();

-- CONTAS A PAGAR / RECEBER
create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('payable','receivable')),
  description text not null,
  category text,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null default current_date,
  paid_at timestamptz,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','overdue')),
  reference_type text,
  reference_id uuid,
  payment_method text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists financial_entries_type_status_due_idx on public.financial_entries(entry_type,status,due_date);
create index if not exists financial_entries_reference_idx on public.financial_entries(reference_type,reference_id);
create unique index if not exists financial_entries_reference_unique on public.financial_entries(reference_type,reference_id) where reference_type is not null and reference_id is not null;
alter table public.financial_entries enable row level security;
drop policy if exists "Staff manages financial entries" on public.financial_entries;
create policy "Staff manages financial entries" on public.financial_entries for all using (public.is_staff()) with check (public.is_staff());

-- Conciliação bancária/gateway.
create table if not exists public.financial_reconciliations (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null references public.financial_entries(id) on delete cascade,
  external_reference text,
  statement_amount numeric(12,2) not null check (statement_amount >= 0),
  reconciled_at timestamptz not null default now(),
  reconciled_by uuid references public.profiles(id),
  notes text
);
create unique index if not exists financial_reconciliation_entry_unique on public.financial_reconciliations(financial_entry_id);
alter table public.financial_reconciliations enable row level security;
drop policy if exists "Staff manages financial reconciliations" on public.financial_reconciliations;
create policy "Staff manages financial reconciliations" on public.financial_reconciliations for all using (public.is_staff()) with check (public.is_staff());

-- Garante que pagamentos confirmados gerem contas a receber apenas uma vez.
create or replace function public.sync_payment_financial_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found then return new; end if;
  if new.status = 'paid' then
    insert into public.financial_entries(entry_type,description,category,amount,due_date,paid_at,status,reference_type,reference_id,payment_method)
    values('receivable','Pedido #'||v_order.order_number,'Venda',new.amount,current_date,coalesce(new.paid_at,now()),'paid','payment',new.id,new.method)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists payments_sync_finance on public.payments;
create trigger payments_sync_finance after insert or update of status,paid_at on public.payments
for each row execute function public.sync_payment_financial_entry();

-- Fidelidade configurável + resgate atômico.
create table if not exists public.loyalty_settings (
  id boolean primary key default true check (id),
  points_per_brl integer not null default 10 check (points_per_brl > 0),
  points_per_redemption integer not null default 100 check (points_per_redemption > 0),
  redemption_value numeric(12,2) not null default 5 check (redemption_value > 0),
  minimum_redemption integer not null default 100 check (minimum_redemption > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.loyalty_settings(id) values(true) on conflict (id) do nothing;
alter table public.loyalty_settings enable row level security;
drop policy if exists "Staff manages loyalty settings" on public.loyalty_settings;
create policy "Staff manages loyalty settings" on public.loyalty_settings for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  points integer not null check (points > 0),
  credit_amount numeric(12,2) not null check (credit_amount > 0),
  status text not null default 'issued' check (status in ('issued','used','cancelled')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.loyalty_redemptions enable row level security;
drop policy if exists "Staff manages loyalty redemptions" on public.loyalty_redemptions;
create policy "Staff manages loyalty redemptions" on public.loyalty_redemptions for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Customer reads own loyalty account" on public.loyalty_accounts;
create policy "Customer reads own loyalty account" on public.loyalty_accounts for select using (exists(select 1 from public.customers c where c.id=customer_id and c.profile_id=auth.uid()));
drop policy if exists "Customer reads own loyalty transactions" on public.loyalty_transactions;
create policy "Customer reads own loyalty transactions" on public.loyalty_transactions for select using (exists(select 1 from public.loyalty_accounts a join public.customers c on c.id=a.customer_id where a.id=account_id and c.profile_id=auth.uid()));


create or replace function public.redeem_loyalty_points(p_points integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_customer uuid; v_account uuid; v_balance integer; v_min integer; v_block integer; v_value numeric(12,2); v_credit numeric(12,2); v_id uuid;
begin
  select id into v_customer from public.customers where profile_id=auth.uid() limit 1;
  if v_customer is null then raise exception 'Cliente não encontrado.' using errcode='42501'; end if;
  select id,points_balance into v_account,v_balance from public.loyalty_accounts where customer_id=v_customer for update;
  if v_account is null then raise exception 'Você ainda não possui pontos.'; end if;
  select minimum_redemption,points_per_redemption,redemption_value into v_min,v_block,v_value from public.loyalty_settings where id=true and active=true;
  if p_points < v_min or mod(p_points,v_block) <> 0 then raise exception 'O resgate deve respeitar a regra de pontos configurada.'; end if;
  if p_points > v_balance then raise exception 'Saldo de pontos insuficiente.'; end if;
  v_credit := round((p_points::numeric / v_block) * v_value,2);
  update public.loyalty_accounts set points_balance=points_balance-p_points,updated_at=now() where id=v_account;
  insert into public.loyalty_transactions(account_id,points,description) values(v_account,-p_points,'Resgate de pontos');
  insert into public.loyalty_redemptions(customer_id,points,credit_amount) values(v_customer,p_points,v_credit) returning id into v_id;
  return jsonb_build_object('success',true,'redemption_id',v_id,'points',p_points,'credit_amount',v_credit);
end;
$$;
revoke all on function public.redeem_loyalty_points(integer) from public,anon;
grant execute on function public.redeem_loyalty_points(integer) to authenticated;

-- RASTREAMENTO SEGURO: token aleatório, telefone e número do pedido.
alter table public.orders add column if not exists tracking_code text default encode(gen_random_bytes(16),'hex');
update public.orders set tracking_code=encode(gen_random_bytes(16),'hex') where tracking_code is null;
create unique index if not exists orders_tracking_code_unique on public.orders(tracking_code);

create or replace function public.get_public_order_tracking(p_order_number bigint,p_phone text,p_tracking_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_events jsonb;
begin
  select * into v_order from public.orders where order_number=p_order_number and tracking_code=p_tracking_code and regexp_replace(customer_phone,'\D','','g')=regexp_replace(p_phone,'\D','','g');
  if not found then return jsonb_build_object('found',false); end if;
  select coalesce(jsonb_agg(jsonb_build_object('status',new_status,'note',note,'created_at',created_at) order by created_at), '[]'::jsonb) into v_events from public.order_status_history where order_id=v_order.id;
  return jsonb_build_object('found',true,'order_number',v_order.order_number,'status',v_order.status,'customer_name',v_order.customer_name,'fulfillment',v_order.fulfillment,'total',v_order.total,'created_at',v_order.created_at,'updated_at',v_order.updated_at,'delivered_at',v_order.delivered_at,'events',v_events);
end;
$$;
revoke all on function public.get_public_order_tracking(bigint,text,text) from public;
grant execute on function public.get_public_order_tracking(bigint,text,text) to anon,authenticated;

-- Fila de notificações WhatsApp. O texto é gerado no servidor para evitar confiança no navegador.
create table if not exists public.whatsapp_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  phone text not null,
  event_type text not null,
  message text not null,
  status text not null default 'pending' check(status in ('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists whatsapp_notifications_queue_idx on public.whatsapp_notifications(status,created_at);
alter table public.whatsapp_notifications enable row level security;
drop policy if exists "Staff reads whatsapp notifications" on public.whatsapp_notifications;
create policy "Staff reads whatsapp notifications" on public.whatsapp_notifications for select using (public.is_staff());

create or replace function public.enqueue_order_whatsapp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event text; v_message text; v_name text; v_site text;
begin
  if tg_op='INSERT' then v_event='order_created'; v_message='Olá '||coalesce(new.customer_name,'cliente')||'! Recebemos seu pedido #'||new.order_number||' no Mercado Jesi. Acompanhe o andamento pelo código de rastreamento enviado no checkout.';
  elsif new.status is distinct from old.status then
    v_event='status_'||new.status::text;
    v_message='Olá '||coalesce(new.customer_name,'cliente')||'! O pedido #'||new.order_number||' agora está com status: '||new.status::text||'.';
  else return new; end if;
  insert into public.whatsapp_notifications(order_id,phone,event_type,message) values(new.id,new.customer_phone,v_event,v_message);
  return new;
end;
$$;
drop trigger if exists orders_enqueue_whatsapp on public.orders;
create trigger orders_enqueue_whatsapp after insert or update of status on public.orders for each row execute function public.enqueue_order_whatsapp();

-- Relatório de lucratividade em uma única consulta protegida para a equipe.
create or replace function public.get_profitability_report(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_revenue numeric(14,2); v_cost numeric(14,2); v_expenses numeric(14,2); v_orders integer; v_completed integer;
begin
  if not public.is_staff() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select coalesce(sum(total),0),count(*),count(*) filter(where status='completed') into v_revenue,v_orders,v_completed from public.orders where created_at between p_from and p_to and status <> 'cancelled';
  select coalesce(sum(oi.quantity*coalesce(oi.unit_cost,0)),0) into v_cost from public.order_items oi join public.orders o on o.id=oi.order_id where o.created_at between p_from and p_to and o.status <> 'cancelled';
  select coalesce(sum(amount),0) into v_expenses from public.expenses where created_at between p_from and p_to;
  return jsonb_build_object('revenue',v_revenue,'cost_of_goods',v_cost,'operating_expenses',v_expenses,'gross_profit',v_revenue-v_cost,'net_profit',v_revenue-v_cost-v_expenses,'margin_percent',case when v_revenue>0 then round(((v_revenue-v_cost-v_expenses)/v_revenue)*100,2) else 0 end,'orders',v_orders,'completed_orders',v_completed);
end;
$$;
revoke all on function public.get_profitability_report(timestamptz,timestamptz) from public;
grant execute on function public.get_profitability_report(timestamptz,timestamptz) to authenticated;

-- Regras configuráveis também valem para a concessão automática.
create or replace function public.award_order_loyalty_points()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account_id uuid; v_points integer; v_rule integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.customer_id is not null then
    select points_per_brl into v_rule from public.loyalty_settings where id=true and active=true;
    v_rule := greatest(coalesce(v_rule,10),1);
    v_points := floor(coalesce(new.total,0) / v_rule)::integer;
    if v_points > 0 then
      insert into public.loyalty_accounts(customer_id) values (new.customer_id)
      on conflict (customer_id) do update set updated_at=now()
      returning id into v_account_id;
      insert into public.loyalty_transactions(account_id,order_id,points,description)
      values(v_account_id,new.id,v_points,'Pontos por pedido concluído')
      on conflict (order_id) do nothing;
      if found then
        update public.loyalty_accounts set points_balance=points_balance+v_points,lifetime_points=lifetime_points+v_points,updated_at=now() where id=v_account_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
