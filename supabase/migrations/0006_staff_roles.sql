-- Novos perfis operacionais para a equipe do Mercado Jesi.
-- Execute esta migration no SQL Editor do Supabase.
alter type public.app_role add value if not exists 'employee';
alter type public.app_role add value if not exists 'delivery';

-- Mantém o acesso às rotinas operacionais para todos os perfis de equipe.
-- O cast para text evita depender do novo enum value dentro desta migration.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role()::text in (
    'owner', 'admin', 'manager', 'employee', 'operator', 'delivery'
  ), false)
$$;
