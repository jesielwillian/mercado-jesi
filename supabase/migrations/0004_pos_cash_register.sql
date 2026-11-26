-- Mercado Jesi | PDV e controle de caixa
-- Migration 0004: funções transacionais do frente de caixa.

alter table public.orders
add column if not exists pos_reference uuid;

create unique index if not exists orders_pos_reference_uidx
on public.orders(pos_reference)
where pos_reference is not null;

create or replace function public.open_cash_register(
  p_opening_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  select id
  into v_register_id
  from public.cash_registers
  where status = 'open'
  limit 1
  for update;

  if v_register_id is not null then
    raise exception 'Já existe um caixa aberto.';
  end if;

  insert into public.cash_registers(opened_by, opening_amount)
  values(v_user, p_opening_amount)
  returning id into v_register_id;

  return v_register_id;
end;
$$;

create or replace function public.finalize_pos_sale(
  p_items jsonb,
  p_payment_method text,
  p_discount numeric default 0,
  p_customer_name text default 'Consumidor final',
  p_customer_phone text default '',
  p_reference uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  v_name := coalesce(
    nullif(trim(p_customer_name), ''),
    'Consumidor final'
  );

  v_phone := coalesce(trim(p_customer_phone), '');

  perform pg_advisory_xact_lock(hashtext('mercado_jesi_cash_register'));

  select id
  into v_register_id
  from public.cash_registers
  where status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if v_register_id is null then
    raise exception 'Abra o caixa antes de registrar vendas.';
  end if;

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

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'Item do carrinho inválido.';
    end;

    if v_quantity is null
      or v_quantity <= 0
      or v_quantity > 999999999 then
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

  insert into public.orders(
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
  values(
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

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    select id, name, unit, price, cost_price
    into v_product
    from public.products
    where id = v_product_id
    for update;

    insert into public.inventory(product_id, quantity)
    values(v_product_id, 0)
    on conflict(product_id) do nothing;

    select quantity
    into v_stock
    from public.inventory
    where product_id = v_product_id
    for update;

    if v_stock < v_quantity then
      raise exception
        'Estoque insuficiente para: % (saldo: %).',
        v_product.name,
        v_stock;
    end if;

    update public.inventory
    set
      quantity = quantity - v_quantity,
      updated_at = now()
    where product_id = v_product_id;

    v_line_total := round(v_product.price * v_quantity, 2);

    insert into public.order_items(
      order_id,
      product_id,
      product_name,
      unit,
      quantity,
      unit_price,
      line_total
    )
    values(
      v_order_id,
      v_product_id,
      v_product.name,
      v_product.unit,
      v_quantity,
      v_product.price,
      v_line_total
    );

    insert into public.stock_movements(
      product_id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values(
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

  insert into public.payments(
    order_id,
    method,
    status,
    amount,
    paid_at
  )
  values(
    v_order_id,
    v_method,
    'paid',
    v_total,
    now()
  );

  insert into public.cash_transactions(
    cash_register_id,
    transaction_type,
    description,
    amount,
    payment_method,
    order_id,
    created_by
  )
  values(
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

create or replace function public.close_cash_register(
  p_register_id uuid,
  p_closing_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select *
  into v_register
  from public.cash_registers
  where id = p_register_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Caixa não encontrado ou já fechado.';
  end if;

  select round(
    v_register.opening_amount
    + coalesce(sum(
      case
        when transaction_type in ('sale', 'deposit')
          and (
            transaction_type <> 'sale'
            or payment_method = 'cash'
          )
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
  set
    closing_amount = p_closing_amount,
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

revoke all on function public.open_cash_register(numeric)
from public, anon;

revoke all on function public.finalize_pos_sale(jsonb, text, numeric, text, text, uuid)
from public, anon;

revoke all on function public.close_cash_register(uuid, numeric)
from public, anon;

grant execute on function public.open_cash_register(numeric)
to authenticated;

grant execute on function public.finalize_pos_sale(jsonb, text, numeric, text, text, uuid)
to authenticated;

grant execute on function public.close_cash_register(uuid, numeric)
to authenticated;
