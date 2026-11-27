-- Mercado Jesi | Notificações de pedido por e-mail.
-- A fila é processada por Edge Function usando Resend; nenhuma chave fica no navegador.

create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  email text not null,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_notifications_queue_idx
  on public.email_notifications(status, created_at);
alter table public.email_notifications enable row level security;
drop policy if exists "Staff reads email notifications" on public.email_notifications;
create policy "Staff reads email notifications"
  on public.email_notifications for select using (public.is_staff());

create or replace function public.enqueue_order_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text; v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'order_created';
  elsif new.status is distinct from old.status then
    v_event := 'status_' || new.status::text;
  else
    return new;
  end if;

  select c.email into v_email
    from public.customers c
   where c.id = new.customer_id;

  if v_email is not null and length(trim(v_email)) > 3 then
    insert into public.email_notifications(order_id, email, event_type)
    values (new.id, lower(trim(v_email)), v_event);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enqueue_email on public.orders;
create trigger orders_enqueue_email
after insert or update of status on public.orders
for each row execute function public.enqueue_order_email();

revoke all on function public.enqueue_order_email() from public, anon, authenticated;
