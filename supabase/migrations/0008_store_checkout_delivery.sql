-- Mercado Jesi | Checkout público seguro, Mercado Pago e entrega própria
-- Aplicar depois da migration 0007.

alter table public.payments
  drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('pix','cash','card','onsite_card','other'));

alter table public.payments
  add column if not exists provider text,
  add column if not exists payment_channel text not null default 'store',
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists assigned_courier text,
  add column if not exists courier_phone text,
  add column if not exists delivery_notes text,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status public.order_status,
  new_status public.order_status not null,
  note text,
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payment_id text,
  processed_at timestamptz not null default now(),
  unique(provider, event_id)
);

alter table public.order_status_history enable row level security;
create policy "Staff reads order status history" on public.order_status_history
  for select using (public.is_staff());
create policy "Staff inserts order status history" on public.order_status_history
  for insert with check (public.is_staff());

-- A Edge Function chama esta função usando a chave service_role. Preço, desconto,
-- frete e estoque são recalculados no banco; nenhum total enviado pelo navegador é aceito.
create or replace function public.create_store_order(
  p_customer jsonb,
  p_items jsonb,
  p_fulfillment text,
  p_payment_method text,
  p_notes text default null,
  p_coupon_code text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_name text;
  v_phone text;
  v_email text;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_coupon public.coupons%rowtype;
  v_coupon_code text;
  v_product record;
  v_item record;
  v_item_json jsonb;
  v_items_result jsonb := '[]'::jsonb;
  v_delivery_enabled boolean;
  v_pickup_enabled boolean;
  v_free_minimum numeric(12,2);
  v_fee numeric(12,2);
  v_address jsonb;
  v_payment_method text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  v_name := trim(coalesce(p_customer->>'name',''));
  v_phone := regexp_replace(coalesce(p_customer->>'phone',''), '\D', '', 'g');
  v_email := nullif(trim(coalesce(p_customer->>'email','')), '');
  if length(v_name) < 2 or length(v_phone) not between 10 and 13 then
    raise exception 'Informe nome e telefone válidos.' using errcode = '22023';
  end if;
  if p_fulfillment not in ('delivery','pickup') then
    raise exception 'Forma de recebimento inválida.' using errcode = '22023';
  end if;
  if p_payment_method not in ('pix','card','onsite_card') then
    raise exception 'Forma de pagamento inválida.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sacola está vazia.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'Limite de 60 itens por pedido.' using errcode = '22023';
  end if;

  select coalesce(delivery_enabled,true), coalesce(pickup_enabled,true),
         coalesce(delivery_fee,0), coalesce(free_delivery_minimum,0)
    into v_delivery_enabled, v_pickup_enabled, v_fee, v_free_minimum
    from public.store_settings where id = true;
  if p_fulfillment = 'delivery' and not coalesce(v_delivery_enabled,true) then
    raise exception 'A entrega está indisponível no momento.' using errcode = '22023';
  elsif p_fulfillment = 'pickup' and not coalesce(v_pickup_enabled,true) then
    raise exception 'A retirada está indisponível no momento.' using errcode = '22023';
  end if;
  v_address := coalesce(p_customer->'address','{}'::jsonb);
  if p_fulfillment = 'delivery' and (
    coalesce(trim(v_address->>'street'),'') = '' or
    coalesce(trim(v_address->>'number'),'') = '' or
    coalesce(trim(v_address->>'neighborhood'),'') = '' or
    coalesce(trim(v_address->>'city'),'') = ''
  ) then
    raise exception 'Informe endereço, número, bairro e cidade para entrega.' using errcode = '22023';
  end if;

  -- Lock dos produtos/estoques em ordem fixa para evitar venda acima do saldo.
  for v_item in
    select (x->>'product_id')::uuid as product_id,
           sum((x->>'quantity')::numeric) as quantity
      from jsonb_array_elements(p_items) x
     group by (x->>'product_id')::uuid
     order by (x->>'product_id')::uuid
  loop
    if v_item.quantity <= 0 or v_item.quantity > 999 then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end if;
    select p.id, p.name, p.unit, p.price, p.active, 0::numeric as stock
      into v_product
      from public.products p
     where p.id = v_item.product_id
     for update;
    if not found or not v_product.active then
      raise exception 'Um produto não está mais disponível.' using errcode = '22023';
    end if;
    select coalesce(quantity,0) into v_product.stock from public.inventory
     where product_id = v_item.product_id for update;
    if not found then v_product.stock := 0; end if;
    if v_product.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para: %.', v_product.name using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + round(v_product.price * v_item.quantity, 2);
    v_items_result := v_items_result || jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'product_name',v_product.name,'unit',v_product.unit,
      'quantity',v_item.quantity,'unit_price',v_product.price,
      'line_total',round(v_product.price*v_item.quantity,2)
    ));
  end loop;

  if p_fulfillment = 'delivery' then
    v_delivery_fee := case when v_free_minimum > 0 and v_subtotal >= v_free_minimum then 0 else v_fee end;
  end if;

  v_coupon_code := nullif(upper(trim(coalesce(p_coupon_code,''))), '');
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons
     where upper(code) = v_coupon_code and active = true
       and (starts_at is null or starts_at <= now())
       and (expires_at is null or expires_at >= now())
       and (usage_limit is null or usage_count < usage_limit)
     for update;
    if not found then raise exception 'Cupom inválido ou expirado.' using errcode = '22023'; end if;
    if v_coupon.discount_type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
    else
      v_discount := least(v_subtotal, v_coupon.discount_value);
    end if;
    update public.coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  v_total := greatest(0, v_subtotal + v_delivery_fee - v_discount);
  select id into v_customer_id from public.customers where regexp_replace(coalesce(phone,''),'\D','','g') = v_phone limit 1;
  if v_customer_id is null then
    insert into public.customers(full_name,email,phone)
    values(v_name,v_email,v_phone) returning id into v_customer_id;
  else
    update public.customers set full_name=v_name, email=coalesce(v_email,email), phone=v_phone
     where id=v_customer_id;
  end if;

  insert into public.orders(customer_id,status,fulfillment,subtotal,delivery_fee,discount,total,
    customer_name,customer_phone,delivery_address,notes,coupon_code)
  values(v_customer_id,'pending',p_fulfillment,v_subtotal,v_delivery_fee,v_discount,v_total,
    v_name,v_phone,case when p_fulfillment='delivery' then v_address else null end,
    nullif(trim(coalesce(p_notes,'')),''),v_coupon_code)
  returning id,order_number into v_order_id,v_order_number;

  for v_item_json in select value from jsonb_array_elements(v_items_result)
  loop
    insert into public.order_items(order_id,product_id,product_name,unit,quantity,unit_price,line_total)
    values(v_order_id,(v_item_json->>'product_id')::uuid,v_item_json->>'product_name',
      (v_item_json->>'unit')::public.product_unit,(v_item_json->>'quantity')::numeric,
      (v_item_json->>'unit_price')::numeric,(v_item_json->>'line_total')::numeric);
    update public.inventory set quantity=quantity-(v_item_json->>'quantity')::numeric,updated_at=now()
     where product_id=(v_item_json->>'product_id')::uuid;
    insert into public.stock_movements(product_id,movement_type,quantity,reference_type,reference_id,notes)
    values((v_item_json->>'product_id')::uuid,'sale',(v_item_json->>'quantity')::numeric,
      'store_order',v_order_id,'Reserva de estoque do pedido online #'||v_order_number);
  end loop;

  insert into public.payments(order_id,method,status,amount,provider,payment_channel)
  values(v_order_id,case when p_payment_method='onsite_card' then 'onsite_card' else p_payment_method end,
    'pending',v_total,case when p_payment_method='onsite_card' then null else 'mercadopago' end,
    case when p_payment_method='onsite_card' then 'onsite' else 'online' end);

  insert into public.order_status_history(order_id,old_status,new_status,note)
  values(v_order_id,null,'pending','Pedido criado pela loja virtual. Estoque reservado.');

  return jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,
    'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'discount',v_discount,'total',v_total,
    'items',v_items_result,'payment_method',p_payment_method);
end;
$$;

revoke all on function public.create_store_order(jsonb,jsonb,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_store_order(jsonb,jsonb,text,text,text,text) to service_role;

-- Vincula o pagamento confirmado ao pedido. A Edge Function consulta a API do MP
-- antes de chamar esta função e só então informa status/valor/external_reference.
create or replace function public.apply_mercadopago_payment(
  p_event_id text,
  p_payment_id text,
  p_order_id uuid,
  p_status text,
  p_amount numeric,
  p_currency text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_new_status text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;
  if p_currency <> 'BRL' then raise exception 'Moeda de pagamento inválida.'; end if;
  if p_status not in ('approved','pending','in_process','rejected','cancelled','refunded','charged_back') then
    raise exception 'Status de pagamento desconhecido.';
  end if;
  insert into public.payment_webhook_events(provider,event_id,payment_id)
  values('mercadopago',coalesce(nullif(p_event_id,''),p_payment_id),p_payment_id)
  on conflict(provider,event_id) do nothing;
  if not found then return; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select * into v_payment from public.payments
   where order_id=p_order_id and provider='mercadopago' and payment_channel='online'
   order by created_at desc limit 1 for update;
  if not found then raise exception 'Cobrança online não encontrada.'; end if;
  if abs(v_order.total-p_amount) > 0.01 or abs(v_payment.amount-p_amount) > 0.01 then
    raise exception 'Valor recebido diferente do pedido.';
  end if;
  v_new_status := case
    when p_status='approved' then 'paid'
    when p_status in ('rejected','cancelled','charged_back') then 'failed'
    when p_status='refunded' then 'refunded'
    else 'pending' end;
  update public.payments set status=v_new_status,provider_reference=p_payment_id,
    paid_at=case when v_new_status='paid' then now() else paid_at end,updated_at=now()
   where id=v_payment.id;
  if v_new_status='paid' and v_order.status='pending' then
    update public.orders set status='confirmed',updated_at=now() where id=p_order_id;
    insert into public.order_status_history(order_id,old_status,new_status,note)
    values(p_order_id,'pending','confirmed','Pagamento confirmado pelo Mercado Pago.');
  end if;
end;
$$;
revoke all on function public.apply_mercadopago_payment(text,text,uuid,text,numeric,text) from public, anon, authenticated;
grant execute on function public.apply_mercadopago_payment(text,text,uuid,text,numeric,text) to service_role;

create or replace function public.cancel_store_order(p_order_id uuid, p_reason text default 'Cancelado pela equipe')
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_item record;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_order.status='cancelled' then return; end if;
  if exists(select 1 from public.payments where order_id=p_order_id and status='paid') then
    raise exception 'Pedido pago exige estorno antes do cancelamento.';
  end if;
  if exists(select 1 from public.payments where order_id=p_order_id and provider='mercadopago'
      and payment_channel='online' and status='pending' and provider_reference is not null) then
    raise exception 'Existe uma cobrança online em andamento. Aguarde a confirmação do Mercado Pago antes de cancelar.';
  end if;
  for v_item in select product_id,quantity from public.order_items where order_id=p_order_id and product_id is not null
  loop
    update public.inventory set quantity=quantity+v_item.quantity,updated_at=now() where product_id=v_item.product_id;
    insert into public.stock_movements(product_id,movement_type,quantity,reference_type,reference_id,notes)
    values(v_item.product_id,'return',v_item.quantity,'store_order',p_order_id,'Liberação de reserva: '||p_reason);
  end loop;
  update public.orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_order_id;
  update public.payments set status='failed',updated_at=now() where order_id=p_order_id and status='pending';
  if v_order.coupon_code is not null then
    update public.coupons set usage_count=greatest(usage_count-1,0) where upper(code)=upper(v_order.coupon_code);
  end if;
  insert into public.order_status_history(order_id,old_status,new_status,note)
  values(p_order_id,v_order.status,'cancelled',p_reason);
end;
$$;
revoke all on function public.cancel_store_order(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_store_order(uuid,text) to service_role;

-- Apenas equipe pode ver o histórico; clientes continuam limitados às políticas existentes.
grant select, insert on public.order_status_history to authenticated;
grant select on public.payment_webhook_events to service_role;

alter table public.payment_webhook_events enable row level security;

-- Proteção básica contra criação automatizada de pedidos: até 5 tentativas por
-- combinação de telefone/IP em janela de 15 minutos.
create table if not exists public.checkout_rate_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.checkout_rate_limits enable row level security;

create or replace function public.consume_checkout_rate_limit(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;
  insert into public.checkout_rate_limits as existing(fingerprint,window_started_at,attempts)
  values(p_fingerprint,now(),1)
  on conflict(fingerprint) do update set
    attempts = case when existing.window_started_at < now()-interval '15 minutes'
      then 1 else existing.attempts+1 end,
    window_started_at = case when existing.window_started_at < now()-interval '15 minutes'
      then now() else existing.window_started_at end
  returning attempts into v_attempts;
  return v_attempts <= 5;
end;
$$;
revoke all on function public.consume_checkout_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limit(text) to service_role;

grant select, insert on public.order_status_history to service_role;
grant all on public.payment_webhook_events, public.checkout_rate_limits to service_role;
