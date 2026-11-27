-- Reaplica a rotina de criação do checkout garantindo a persistência de orders.notes.
-- Mantém a validação de service_role corrigida pela migration 0012.

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
  if coalesce(auth.role(), '') <> 'service_role' then
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
