-- Caixa de entrada do formulário público de contato.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 30),
  subject text not null check (char_length(subject) between 2 and 140),
  message text not null check (char_length(message) between 5 and 5000),
  status text not null default 'new' check (status in ('new','read','replied','archived')),
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx on public.contact_messages(created_at desc);
create index if not exists contact_messages_status_idx on public.contact_messages(status, created_at desc);
alter table public.contact_messages enable row level security;

-- Visitantes podem enviar mensagens, mas nunca consultar ou alterar a caixa de entrada.
drop policy if exists "Anyone can submit contact messages" on public.contact_messages;
create policy "Anyone can submit contact messages"
  on public.contact_messages for insert to anon, authenticated
  with check (status = 'new');

-- Apenas usuários administrativos/operacionais ativos podem ler e gerenciar mensagens.
drop policy if exists "Staff can read contact messages" on public.contact_messages;
create policy "Staff can read contact messages"
  on public.contact_messages for select to authenticated
  using (public.is_staff());

drop policy if exists "Staff can update contact messages" on public.contact_messages;
create policy "Staff can update contact messages"
  on public.contact_messages for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff can delete contact messages" on public.contact_messages;
create policy "Staff can delete contact messages"
  on public.contact_messages for delete to authenticated
  using (public.is_staff());

grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
