-- Arquivamento lógico de pedidos: preserva pedidos, itens e pagamentos.
alter table public.orders
  add column if not exists archived_at timestamptz;

create index if not exists orders_archived_at_created_at_idx
  on public.orders (archived_at, created_at desc);

comment on column public.orders.archived_at is
  'Data de arquivamento administrativo. NULL significa pedido ativo.';
