-- Restauração administrativa de pedidos arquivados.
-- Não modifica pagamentos, cobranças, itens ou movimentações financeiras.
create or replace function public.restore_archived_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restored_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  update public.orders
     set archived_at = null
   where id = p_order_id
     and archived_at is not null
   returning id into v_restored_id;

  if v_restored_id is null then
    if not exists (
      select 1 from public.orders where id = p_order_id
    ) then
      raise exception 'Pedido não encontrado.' using errcode = 'P0002';
    end if;

    raise exception 'Este pedido não está arquivado.' using errcode = '23514';
  end if;

  return jsonb_build_object(
    'success', true,
    'restored', true
  );
end;
$$;

revoke all on function public.restore_archived_order(uuid) from public;
grant execute on function public.restore_archived_order(uuid) to authenticated;

notify pgrst, 'reload schema';
