-- Permite que o entregador veja pedidos atribuídos antes de estarem prontos.
-- A ação de iniciar continua restrita a pedidos com status 'ready'.
create or replace function public.driver_my_active_deliveries()
returns table(order_id uuid, order_number bigint, customer_name text, delivery_address jsonb, status text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.order_number, o.customer_name, o.delivery_address, o.status::text
  from public.orders as o
  where o.courier_user_id = (select auth.uid())
    and o.fulfillment = 'delivery'
    and o.status in ('confirmed', 'preparing', 'ready', 'out_for_delivery')
  order by o.created_at desc;
$$;
revoke all on function public.driver_my_active_deliveries() from public, anon;
grant execute on function public.driver_my_active_deliveries() to authenticated;
