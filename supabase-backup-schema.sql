


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."product_unit" AS ENUM (
    'un',
    'kg',
    'g',
    'l',
    'ml',
    'pack'
);


ALTER TYPE "public"."product_unit" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_mercadopago_payment"("p_event_id" "text", "p_payment_id" "text", "p_order_id" "uuid", "p_status" "text", "p_amount" numeric, "p_currency" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."apply_mercadopago_payment"("p_event_id" "text", "p_payment_id" "text", "p_order_id" "uuid", "p_status" "text", "p_amount" numeric, "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_store_order"("p_order_id" "uuid", "p_reason" "text" DEFAULT 'Cancelado pela equipe'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_store_order"("p_order_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_cash_register"("p_register_id" "uuid", "p_closing_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid := auth.uid();
  v_register public.cash_registers%rowtype;
  v_expected numeric(12,2);
  v_difference numeric(12,2);
begin
  if v_user is null or not public.is_staff() then
    raise exception 'Acesso não autorizado.';
  end if;

  if p_closing_amount is null or p_closing_amount < 0 then
    raise exception 'Valor de fechamento inválido.';
  end if;

  perform pg_advisory_xact_lock(hashtext('mercado_jesi_cash_register'));

  select * into v_register
  from public.cash_registers
  where id = p_register_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Caixa não encontrado ou já fechado.';
  end if;

  -- Considera somente movimentações em dinheiro no saldo físico.
  select round(
    v_register.opening_amount
    + coalesce(sum(
      case
        when transaction_type in ('sale', 'deposit')
          and (transaction_type <> 'sale' or payment_method = 'cash')
          then amount
        when transaction_type in ('expense', 'withdrawal')
          then -amount
        else 0
      end
    ), 0),
    2
  )
  into v_expected
  from public.cash_transactions
  where cash_register_id = p_register_id;

  v_difference := p_closing_amount - v_expected;

  update public.cash_registers
  set closing_amount = p_closing_amount,
      closed_by = v_user,
      closed_at = now(),
      status = 'closed'
  where id = p_register_id;

  return jsonb_build_object(
    'expected_amount', v_expected,
    'closing_amount', p_closing_amount,
    'difference', v_difference
  );
end;
$$;


ALTER FUNCTION "public"."close_cash_register"("p_register_id" "uuid", "p_closing_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_checkout_rate_limit"("p_fingerprint" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."consume_checkout_rate_limit"("p_fingerprint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_store_order"("p_customer" "jsonb", "p_items" "jsonb", "p_fulfillment" "text", "p_payment_method" "text", "p_notes" "text" DEFAULT NULL::"text", "p_coupon_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_store_order"("p_customer" "jsonb", "p_items" "jsonb", "p_fulfillment" "text", "p_payment_method" "text", "p_notes" "text", "p_coupon_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_app_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT p.role
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.active = TRUE
    LIMIT 1;
$$;


ALTER FUNCTION "public"."current_app_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_pos_sale"("p_items" "jsonb", "p_payment_method" "text", "p_discount" numeric DEFAULT 0, "p_customer_name" "text" DEFAULT 'Consumidor final'::"text", "p_customer_phone" "text" DEFAULT ''::"text", "p_reference" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid := auth.uid();
  v_register_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_existing jsonb;
  v_item jsonb;
  v_product record;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_stock numeric(12,3);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2);
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_method text;
  v_name text;
  v_phone text;
begin
  if v_user is null or not public.is_staff() then
    raise exception 'Acesso não autorizado.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'O carrinho está vazio.';
  end if;

  v_method := lower(trim(coalesce(p_payment_method, '')));

  if v_method not in ('cash', 'pix', 'card') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  v_discount := coalesce(p_discount, 0);

  if v_discount < 0 then
    raise exception 'Desconto inválido.';
  end if;

  v_name := coalesce(nullif(trim(p_customer_name), ''), 'Consumidor final');
  v_phone := coalesce(trim(p_customer_phone), '');

  -- Serializa vendas e operações de caixa.
  perform pg_advisory_xact_lock(hashtext('mercado_jesi_cash_register'));

  select id into v_register_id
  from public.cash_registers
  where status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if v_register_id is null then
    raise exception 'Abra o caixa antes de registrar vendas.';
  end if;

  -- Protege contra reenvio da mesma venda.
  if p_reference is not null then
    select jsonb_build_object(
      'order_id', id,
      'order_number', order_number,
      'total', total,
      'already_processed', true
    )
    into v_existing
    from public.orders
    where pos_reference = p_reference;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- Valida e calcula os itens usando preços do banco.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'Item do carrinho inválido.';
    end;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999999 then
      raise exception 'Quantidade inválida.';
    end if;

    select id, name, unit, price, cost_price, active
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found or not v_product.active then
      raise exception 'Produto indisponível.';
    end if;

    v_line_total := round(v_product.price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'O desconto não pode superar o subtotal.';
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  if v_total <= 0 then
    raise exception 'O total da venda precisa ser maior que zero.';
  end if;

  insert into public.orders (
    status,
    fulfillment,
    subtotal,
    discount,
    total,
    customer_name,
    customer_phone,
    notes,
    pos_reference
  )
  values (
    'completed',
    'pickup',
    v_subtotal,
    v_discount,
    v_total,
    v_name,
    v_phone,
    'Venda presencial - PDV',
    p_reference
  )
  returning id, order_number
  into v_order_id, v_order_number;

  -- Registra itens e baixa o estoque.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    select id, name, unit, price, cost_price
    into v_product
    from public.products
    where id = v_product_id
    for update;

    insert into public.inventory (product_id, quantity)
    values (v_product_id, 0)
    on conflict (product_id) do nothing;

    select quantity into v_stock
    from public.inventory
    where product_id = v_product_id
    for update;

    if v_stock < v_quantity then
      raise exception 'Estoque insuficiente para: % (saldo: %).',
        v_product.name, v_stock;
    end if;

    update public.inventory
    set quantity = quantity - v_quantity,
        updated_at = now()
    where product_id = v_product_id;

    v_line_total := round(v_product.price * v_quantity, 2);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_order_id,
      v_product_id,
      v_product.name,
      v_product.unit,
      v_quantity,
      v_product.price,
      v_line_total
    );

    insert into public.stock_movements (
      product_id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      v_product_id,
      'sale',
      v_quantity,
      v_product.cost_price,
      'order',
      v_order_id,
      'Venda presencial PDV #' || v_order_number,
      v_user
    );
  end loop;

  insert into public.payments (
    order_id,
    method,
    status,
    amount,
    paid_at
  )
  values (
    v_order_id,
    v_method,
    'paid',
    v_total,
    now()
  );

  insert into public.cash_transactions (
    cash_register_id,
    transaction_type,
    description,
    amount,
    payment_method,
    order_id,
    created_by
  )
  values (
    v_register_id,
    'sale',
    'Venda PDV #' || v_order_number,
    v_total,
    v_method,
    v_order_id,
    v_user
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'already_processed', false
  );
end;
$$;


ALTER FUNCTION "public"."finalize_pos_sale"("p_items" "jsonb", "p_payment_method" "text", "p_discount" numeric, "p_customer_name" "text", "p_customer_phone" "text", "p_reference" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    INSERT INTO public.profiles (id, role, active)
    VALUES (NEW.id, 'customer', TRUE)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT COALESCE(
        public.current_app_role() IN (
            'owner', 'admin', 'manager', 'operator'
        ),
        FALSE
    );
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_stock"("p_product_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric DEFAULT NULL::numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_current numeric(12,3);
  v_new_quantity numeric(12,3);
  v_movement_quantity numeric(12,3);
  v_notes text;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Acesso não autorizado.';
  end if;

  if p_product_id is null then
    raise exception 'Produto não informado.';
  end if;

  if p_movement_type not in ('in', 'out', 'adjustment', 'return') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;

  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'O custo não pode ser negativo.';
  end if;

  insert into public.inventory (product_id, quantity)
  values (p_product_id, 0)
  on conflict (product_id) do nothing;

  select quantity
    into v_current
    from public.inventory
   where product_id = p_product_id
   for update;

  if p_movement_type in ('in', 'return') then
    v_new_quantity := v_current + p_quantity;
  elsif p_movement_type = 'out' then
    if v_current < p_quantity then
      raise exception 'Estoque insuficiente. Saldo atual: %', v_current;
    end if;

    v_new_quantity := v_current - p_quantity;
  else
    v_new_quantity := p_quantity;
  end if;

  if v_new_quantity > 999999999.999 then
    raise exception 'Limite de estoque excedido.';
  end if;

  v_movement_quantity := abs(v_new_quantity - v_current);

  update public.inventory
     set quantity = v_new_quantity,
         updated_at = now()
   where product_id = p_product_id;

  if v_movement_quantity > 0 then
    v_notes := case
      when p_movement_type = 'adjustment'
      then concat_ws(
        ' | ',
        nullif(trim(p_notes), ''),
        'Ajuste de saldo: ' || v_current || ' → ' || v_new_quantity
      )
      else nullif(trim(p_notes), '')
    end;

    insert into public.stock_movements (
      product_id,
      movement_type,
      quantity,
      unit_cost,
      notes,
      created_by
    )
    values (
      p_product_id,
      p_movement_type,
      v_movement_quantity,
      p_unit_cost,
      v_notes,
      auth.uid()
    );
  end if;

  return v_new_quantity;
end;
$$;


ALTER FUNCTION "public"."manage_stock"("p_product_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_cash_register"("p_opening_amount" numeric DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid := auth.uid();
  v_register_id uuid;
begin
  if v_user is null or not public.is_staff() then
    raise exception 'Acesso não autorizado.';
  end if;

  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'Valor inicial inválido.';
  end if;

  perform pg_advisory_xact_lock(hashtext('mercado_jesi_cash_register'));

  select id into v_register_id
  from public.cash_registers
  where status = 'open'
  limit 1
  for update;

  if v_register_id is not null then
    raise exception 'Já existe um caixa aberto.';
  end if;

  insert into public.cash_registers (opened_by, opening_amount)
  values (v_user, p_opening_amount)
  returning id into v_register_id;

  return v_register_id;
end;
$$;


ALTER FUNCTION "public"."open_cash_register"("p_opening_amount" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "label" "text" DEFAULT 'Principal'::"text",
    "recipient" "text" NOT NULL,
    "postal_code" "text" NOT NULL,
    "street" "text" NOT NULL,
    "number" "text" NOT NULL,
    "complement" "text",
    "neighborhood" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_registers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opened_by" "uuid",
    "closed_by" "uuid",
    "opening_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "closing_amount" numeric(12,2),
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    CONSTRAINT "cash_registers_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."cash_registers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cash_register_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text",
    "order_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cash_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cash_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['sale'::"text", 'expense'::"text", 'withdrawal'::"text", 'deposit'::"text"])))
);


ALTER TABLE "public"."cash_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkout_rate_limits" (
    "fingerprint" "text" NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."checkout_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "subject" "text" DEFAULT ''::"text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_messages_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'read'::"text", 'replied'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(12,2) NOT NULL,
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "usage_limit" integer,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "coupons_discount_value_check" CHECK (("discount_value" > (0)::numeric))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "expenses_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "product_id" "uuid" NOT NULL,
    "quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "minimum_quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_name" "text" NOT NULL,
    "unit" "public"."product_unit" DEFAULT 'un'::"public"."product_unit" NOT NULL,
    "quantity" numeric(12,3) NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "line_total" numeric(12,2) NOT NULL,
    CONSTRAINT "order_items_line_total_check" CHECK (("line_total" >= (0)::numeric)),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "old_status" "public"."order_status",
    "new_status" "public"."order_status" NOT NULL,
    "note" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" bigint NOT NULL,
    "customer_id" "uuid",
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "fulfillment" "text" DEFAULT 'delivery'::"text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "delivery_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "delivery_address" "jsonb",
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pos_reference" "uuid",
    "coupon_code" "text",
    "assigned_courier" "text",
    "courier_phone" "text",
    "delivery_notes" "text",
    "delivered_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "orders_fulfillment_check" CHECK (("fulfillment" = ANY (ARRAY['delivery'::"text", 'pickup'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


ALTER TABLE "public"."orders" ALTER COLUMN "order_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."orders_order_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "payment_id" "text",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "method" "text" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "provider_reference" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "provider" "text",
    "payment_channel" "text" DEFAULT 'store'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['pix'::"text", 'cash'::"text", 'card'::"text", 'onsite_card'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "alt_text" "text" DEFAULT ''::"text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid",
    "brand_id" "uuid",
    "sku" "text",
    "barcode" "text",
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "unit" "public"."product_unit" DEFAULT 'un'::"public"."product_unit" NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "cost_price" numeric(12,2) DEFAULT 0,
    "active" boolean DEFAULT true,
    "featured" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "products_cost_price_check" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "products_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'customer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric(12,3) NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0,
    "notes" "text" DEFAULT ''::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['in'::"text", 'out'::"text", 'adjustment'::"text", 'sale'::"text", 'return'::"text"])))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "store_name" "text" DEFAULT 'Mercado Jesi'::"text" NOT NULL,
    "document" "text",
    "email" "text",
    "phone" "text",
    "whatsapp" "text",
    "address" "text",
    "opening_hours" "text",
    "delivery_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "free_delivery_minimum" numeric(12,2) DEFAULT 0 NOT NULL,
    "pickup_enabled" boolean DEFAULT true NOT NULL,
    "delivery_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "store_settings_delivery_fee_check" CHECK (("delivery_fee" >= (0)::numeric)),
    CONSTRAINT "store_settings_free_delivery_minimum_check" CHECK (("free_delivery_minimum" >= (0)::numeric)),
    CONSTRAINT "store_settings_id_check" CHECK (("id" = true))
);


ALTER TABLE "public"."store_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "document" "text",
    "phone" "text",
    "email" "text",
    "notes" "text" DEFAULT ''::"text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_registers"
    ADD CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."checkout_rate_limits"
    ADD CONSTRAINT "checkout_rate_limits_pkey" PRIMARY KEY ("fingerprint");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_provider_event_id_key" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_settings"
    ADD CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_addresses_customer" ON "public"."addresses" USING "btree" ("customer_id");



CREATE INDEX "idx_cash_registers_status" ON "public"."cash_registers" USING "btree" ("status");



CREATE INDEX "idx_cash_transactions_register" ON "public"."cash_transactions" USING "btree" ("cash_register_id");



CREATE INDEX "idx_contact_messages_created" ON "public"."contact_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contact_messages_status" ON "public"."contact_messages" USING "btree" ("status");



CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code");



CREATE INDEX "idx_customers_profile" ON "public"."customers" USING "btree" ("profile_id");



CREATE INDEX "idx_expenses_due_date" ON "public"."expenses" USING "btree" ("due_date");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_created" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_customer" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_payments_order" ON "public"."payments" USING "btree" ("order_id");



CREATE INDEX "idx_product_images_product" ON "public"."product_images" USING "btree" ("product_id");



CREATE INDEX "idx_products_active" ON "public"."products" USING "btree" ("active");



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category_id");



CREATE INDEX "idx_profiles_active" ON "public"."profiles" USING "btree" ("active");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_stock_movements_product" ON "public"."stock_movements" USING "btree" ("product_id");



CREATE INDEX "idx_suppliers_active" ON "public"."suppliers" USING "btree" ("active");



CREATE UNIQUE INDEX "orders_pos_reference_uidx" ON "public"."orders" USING "btree" ("pos_reference") WHERE ("pos_reference" IS NOT NULL);



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_registers"
    ADD CONSTRAINT "cash_registers_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_registers"
    ADD CONSTRAINT "cash_registers_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."store_settings"
    ADD CONSTRAINT "store_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



CREATE POLICY "Public reads store settings" ON "public"."store_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Staff inserts order status history" ON "public"."order_status_history" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manages store settings" ON "public"."store_settings" TO "authenticated" USING (("public"."current_app_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_app_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Staff reads order status history" ON "public"."order_status_history" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Usuário pode consultar o próprio perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_registers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkout_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_manage_own_addresses" ON "public"."addresses" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "addresses"."customer_id") AND ("c"."profile_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "addresses"."customer_id") AND ("c"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "customer_read_own_order_items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."customers" "c" ON (("c"."id" = "o"."customer_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("c"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "customer_read_own_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "orders"."customer_id") AND ("c"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "customer_read_own_payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."customers" "c" ON (("c"."id" = "o"."customer_id")))
  WHERE (("o"."id" = "payments"."order_id") AND ("c"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "customer_read_own_record" ON "public"."customers" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_insert_contact_messages" ON "public"."contact_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (("status" = 'new'::"text"));



CREATE POLICY "public_read_brands" ON "public"."brands" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "public_read_categories" ON "public"."categories" FOR SELECT TO "authenticated", "anon" USING (("active" = true));



CREATE POLICY "public_read_product_images" ON "public"."product_images" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "product_images"."product_id") AND ("p"."active" = true)))));



CREATE POLICY "public_read_products" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING (("active" = true));



CREATE POLICY "staff_insert_stock_movements" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_addresses" ON "public"."addresses" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_brands" ON "public"."brands" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_cash_registers" ON "public"."cash_registers" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_cash_transactions" ON "public"."cash_transactions" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_categories" ON "public"."categories" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_contact_messages" ON "public"."contact_messages" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_coupons" ON "public"."coupons" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_customers" ON "public"."customers" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_expenses" ON "public"."expenses" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_inventory" ON "public"."inventory" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_order_items" ON "public"."order_items" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_orders" ON "public"."orders" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_payments" ON "public"."payments" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_product_images" ON "public"."product_images" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_products" ON "public"."products" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_manage_suppliers" ON "public"."suppliers" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "staff_read_stock_movements" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ("public"."is_staff"());



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."apply_mercadopago_payment"("p_event_id" "text", "p_payment_id" "text", "p_order_id" "uuid", "p_status" "text", "p_amount" numeric, "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_mercadopago_payment"("p_event_id" "text", "p_payment_id" "text", "p_order_id" "uuid", "p_status" "text", "p_amount" numeric, "p_currency" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_store_order"("p_order_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_store_order"("p_order_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_cash_register"("p_register_id" "uuid", "p_closing_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_cash_register"("p_register_id" "uuid", "p_closing_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_cash_register"("p_register_id" "uuid", "p_closing_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_checkout_rate_limit"("p_fingerprint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_checkout_rate_limit"("p_fingerprint" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_store_order"("p_customer" "jsonb", "p_items" "jsonb", "p_fulfillment" "text", "p_payment_method" "text", "p_notes" "text", "p_coupon_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_store_order"("p_customer" "jsonb", "p_items" "jsonb", "p_fulfillment" "text", "p_payment_method" "text", "p_notes" "text", "p_coupon_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_app_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_pos_sale"("p_items" "jsonb", "p_payment_method" "text", "p_discount" numeric, "p_customer_name" "text", "p_customer_phone" "text", "p_reference" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_pos_sale"("p_items" "jsonb", "p_payment_method" "text", "p_discount" numeric, "p_customer_name" "text", "p_customer_phone" "text", "p_reference" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_pos_sale"("p_items" "jsonb", "p_payment_method" "text", "p_discount" numeric, "p_customer_name" "text", "p_customer_phone" "text", "p_reference" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."manage_stock"("p_product_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_stock"("p_product_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_stock"("p_product_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_cash_register"("p_opening_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_cash_register"("p_opening_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_cash_register"("p_opening_amount" numeric) TO "service_role";


















GRANT ALL ON TABLE "public"."addresses" TO "anon";
GRANT ALL ON TABLE "public"."addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."addresses" TO "service_role";



GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."cash_registers" TO "anon";
GRANT ALL ON TABLE "public"."cash_registers" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_registers" TO "service_role";



GRANT ALL ON TABLE "public"."cash_transactions" TO "anon";
GRANT ALL ON TABLE "public"."cash_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."checkout_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."checkout_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."checkout_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."product_images" TO "anon";
GRANT ALL ON TABLE "public"."product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."product_images" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."store_settings" TO "anon";
GRANT ALL ON TABLE "public"."store_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."store_settings" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































