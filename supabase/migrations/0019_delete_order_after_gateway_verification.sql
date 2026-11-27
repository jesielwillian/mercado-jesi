-- Exclusão definitiva após validação da cobrança pelo backend.
-- A função só pode ser executada com a chave service_role, nunca pelo navegador.
create or replace function public.delete_order_after_gateway_verification(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  select id into v_order_id
    from public.orders
   where id = p_order_id
   for update;

  if v_order_id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.cash_transactions where order_id = p_order_id) then
    raise exception 'O pedido possui movimentações no caixa e não pode ser excluído.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and (status::text in ('paid', 'refunded') or paid_at is not null)
  ) then
    raise exception 'O pedido possui histórico financeiro e não pode ser excluído. Arquive-o.' using errcode = '23514';
  end if;

  -- Pendências só chegam aqui depois que a Edge Function encerrou a preferência
  -- no gateway e confirmou que não há pagamento ativo ou aprovado.
  delete from public.orders where id = p_order_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.delete_order_after_gateway_verification(uuid) from public, anon, authenticated;
grant execute on function public.delete_order_after_gateway_verification(uuid) to service_role;

notify pgrst, 'reload schema';
