-- Permite que o cliente acompanhe o próprio pedido usando somente o código secreto.
-- A localização só é retornada enquanto o entregador estiver compartilhando GPS.
create or replace function public.get_public_order_tracking_by_code(p_tracking_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_events jsonb;
  v_location jsonb;
begin
  if p_tracking_code is null or length(trim(p_tracking_code)) < 24 or length(trim(p_tracking_code)) > 128 then
    return jsonb_build_object('found', false);
  end if;

  select * into v_order
  from public.orders
  where tracking_code = trim(p_tracking_code)
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('status', h.new_status, 'note', h.note, 'created_at', h.created_at) order by h.created_at),
    '[]'::jsonb
  ) into v_events
  from public.order_status_history h
  where h.order_id = v_order.id;

  select case when dl.active = true and v_order.status::text = 'out_for_delivery' then
    jsonb_build_object(
      'latitude', dl.latitude,
      'longitude', dl.longitude,
      'accuracy_m', dl.accuracy_m,
      'recorded_at', dl.recorded_at,
      'active', dl.active
    ) else null end
  into v_location
  from public.delivery_locations dl
  where dl.order_id = v_order.id;

  return jsonb_build_object(
    'found', true,
    'order_number', v_order.order_number,
    'status', v_order.status::text,
    'fulfillment', v_order.fulfillment,
    'total', v_order.total,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'delivered_at', v_order.delivered_at,
    'events', v_events,
    'location', v_location
  );
end;
$$;

revoke all on function public.get_public_order_tracking_by_code(text) from public;
grant execute on function public.get_public_order_tracking_by_code(text) to anon, authenticated;
