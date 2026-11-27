-- Arquivamento administrativo de pedidos com histórico financeiro.
-- Não altera nem remove pagamentos, cobranças ou movimentações do caixa.
create or replace function public.archive_order_preserving_financial_history(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archived_at timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  update public.orders
     set archived_at = coalesce(archived_at, now())
   where id = p_order_id
   returning archived_at into v_archived_at;

  if v_archived_at is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'success', true,
    'archived_at', v_archived_at
  );
end;
$$;

revoke all on function public.archive_order_preserving_financial_history(uuid) from public;
grant execute on function public.archive_order_preserving_financial_history(uuid) to authenticated;

notify pgrst, 'reload schema';
