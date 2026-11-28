-- Rastreamento GPS ao vivo. Execute após as migrações 0001–0023.
alter type public.app_role add value if not exists 'delivery';
alter table public.orders add column if not exists courier_user_id uuid references public.profiles(id) on delete set null;
create table if not exists public.delivery_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  courier_user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  recorded_at timestamptz not null default now(),
  active boolean not null default true
);
alter table public.delivery_locations enable row level security;
revoke all on public.delivery_locations from anon, authenticated;
grant select on public.delivery_locations to authenticated;
create policy delivery_location_staff_read on public.delivery_locations for select to authenticated using (public.current_app_role() in ('owner','admin','manager','operator'));

create or replace function public.driver_update_delivery_location(p_order_id uuid,p_lat double precision,p_lng double precision,p_accuracy double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_courier uuid;
begin
 select role::text into v_role from public.profiles where id=(select auth.uid()) and active=true;
 if v_role <> 'delivery' then raise exception 'Acesso restrito a entregadores ativos'; end if;
 select courier_user_id into v_courier from public.orders where id=p_order_id and fulfillment='delivery' and status='out_for_delivery';
 if v_courier is distinct from (select auth.uid()) then raise exception 'Pedido não atribuído a este entregador ou entrega não iniciada'; end if;
 insert into public.delivery_locations(order_id,courier_user_id,latitude,longitude,accuracy_m,recorded_at,active)
 values(p_order_id,(select auth.uid()),p_lat,p_lng,p_accuracy,now(),true)
 on conflict(order_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,recorded_at=now(),active=true;
end; $$;
revoke all on function public.driver_update_delivery_location(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.driver_update_delivery_location(uuid,double precision,double precision,double precision) to authenticated;

create or replace function public.driver_stop_delivery_location(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.delivery_locations set active=false,recorded_at=now()
 where order_id=p_order_id and courier_user_id=(select auth.uid());
 if not found then raise exception 'Entrega não encontrada para este entregador'; end if;
end; $$;
revoke all on function public.driver_stop_delivery_location(uuid) from public, anon;
grant execute on function public.driver_stop_delivery_location(uuid) to authenticated;

create or replace function public.driver_my_active_deliveries()
returns table(order_id uuid,order_number bigint,customer_name text,delivery_address jsonb,status text)
language sql stable security definer set search_path = '' as $$
 select o.id,o.order_number,o.customer_name,o.delivery_address,o.status::text
 from public.orders o where o.courier_user_id=(select auth.uid()) and o.fulfillment='delivery' and o.status in ('ready','out_for_delivery');
$$;
revoke all on function public.driver_my_active_deliveries() from public, anon;
grant execute on function public.driver_my_active_deliveries() to authenticated;

create or replace function public.driver_start_delivery(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=(select auth.uid()) and active=true and role::text='delivery') then raise exception 'Acesso restrito a entregadores ativos'; end if;
 update public.orders set status='out_for_delivery',updated_at=now() where id=p_order_id and courier_user_id=(select auth.uid()) and fulfillment='delivery' and status='ready';
 if not found then raise exception 'Pedido não atribuído ou não está pronto'; end if;
end; $$;
revoke all on function public.driver_start_delivery(uuid) from public, anon;
grant execute on function public.driver_start_delivery(uuid) to authenticated;
