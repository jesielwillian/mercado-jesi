-- Exclusão definitiva protegida: somente pedidos sem qualquer registro financeiro.
-- A função valida novamente no banco, evitando depender apenas da interface.
create or replace function public.delete_order_without_financial_history(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  select id into v_order_id
    from public.orders
   where id = p_order_id
   for update;

  if v_order_id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.payments where order_id = p_order_id)
     or exists (select 1 from public.cash_transactions where order_id = p_order_id) then
    raise exception 'Este pedido possui histórico financeiro e não pode ser excluído. Arquive-o para preservar os registros.'
      using errcode = '23514';
  end if;

  -- order_items e order_status_history são removidos por ON DELETE CASCADE.
  delete from public.orders where id = p_order_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.delete_order_without_financial_history(uuid) from public;
grant execute on function public.delete_order_without_financial_history(uuid) to authenticated;
