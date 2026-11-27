-- A Edge Function valida a sessão da equipe e consulta o Mercado Pago antes de chamar esta RPC.
-- A RPC é exclusiva da service_role e faz uma última validação transacional no banco.
create or replace function public.delete_order_after_gateway_verification(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  select id
    into v_order_id
    from public.orders
   where id = p_order_id
   for update;

  if v_order_id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
      from public.cash_transactions
     where order_id = p_order_id
  ) then
    raise exception 'Este pedido possui movimentação no caixa e não pode ser excluído.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.payments
     where order_id = p_order_id
       and (paid_at is not null or status not in ('pending', 'failed'))
  ) then
    raise exception 'Este pedido possui histórico financeiro e não pode ser excluído.'
      using errcode = '23514';
  end if;

  -- Os pagamentos pendentes/falhos e itens do pedido são removidos pelo ON DELETE CASCADE.
  -- Pagamentos recebidos/estornados e movimentos de caixa são sempre bloqueados acima.
  delete from public.orders where id = p_order_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.delete_order_after_gateway_verification(uuid) from public, anon, authenticated;
grant execute on function public.delete_order_after_gateway_verification(uuid) to service_role;

-- Desativa o endpoint SQL antigo, que bloqueava inclusive pagamentos pendentes.
-- A exclusão passa a ocorrer somente pela Edge Function com validação no gateway.
revoke all on function public.delete_order_without_financial_history(uuid) from public, anon, authenticated;
