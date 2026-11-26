-- Oculta resultados antigos da lista de caixas fechados sem excluir dados financeiros.
alter table public.cash_registers
  add column if not exists archived_at timestamptz;

create index if not exists cash_registers_archived_closed_idx
  on public.cash_registers (status, archived_at, closed_at desc);

comment on column public.cash_registers.archived_at is
  'Quando preenchido, o fechamento fica oculto da lista recente; dados e movimentações são preservados.';
