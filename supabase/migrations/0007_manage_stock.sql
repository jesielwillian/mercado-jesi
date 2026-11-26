-- Mercado Jesi | Movimentação segura de estoque
-- Necessária para o módulo Estoque, que chama public.manage_stock().

create or replace function public.manage_stock(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_notes text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_movement_type, '')));
  v_requested numeric(12,3) := p_quantity;
  v_current numeric(12,3);
  v_new numeric(12,3);
  v_movement_quantity numeric(12,3);
begin
  if v_user is null or not public.is_staff() then
    raise exception 'Acesso não autorizado.';
  end if;

  if p_product_id is null then
    raise exception 'Selecione um produto.';
  end if;

  if v_type not in ('in', 'out', 'adjustment', 'return') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  if v_requested is null or v_requested <= 0 or v_requested > 999999999 then
    raise exception 'Informe uma quantidade válida.';
  end if;

  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'O custo unitário não pode ser negativo.';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.active = true
  ) then
    raise exception 'Produto não encontrado ou inativo.';
  end if;

  insert into public.inventory(product_id, quantity)
  values (p_product_id, 0)
  on conflict (product_id) do nothing;

  select i.quantity into v_current
  from public.inventory i
  where i.product_id = p_product_id
  for update;

  if v_type = 'adjustment' then
    v_new := v_requested;
    v_movement_quantity := abs(v_new - v_current);
    if v_movement_quantity = 0 then
      raise exception 'O saldo informado já é o saldo atual.';
    end if;
  elsif v_type = 'out' then
    if v_current < v_requested then
      raise exception 'Estoque insuficiente. Saldo atual: %.', v_current;
    end if;
    v_new := v_current - v_requested;
    v_movement_quantity := v_requested;
  else
    v_new := v_current + v_requested;
    v_movement_quantity := v_requested;
  end if;

  update public.inventory
  set quantity = v_new, updated_at = now()
  where product_id = p_product_id;

  insert into public.stock_movements(
    product_id, movement_type, quantity, unit_cost,
    reference_type, notes, created_by
  ) values (
    p_product_id, v_type, v_movement_quantity, p_unit_cost,
    'manual', nullif(trim(coalesce(p_notes, '')), ''), v_user
  );

  return v_new;
end;
$$;

revoke all on function public.manage_stock(uuid, text, numeric, numeric, text) from public;
grant execute on function public.manage_stock(uuid, text, numeric, numeric, text) to authenticated;
