-- Permite que cada pessoa atualize apenas nome e telefone do próprio perfil.
-- A função não aceita nem altera role, active ou qualquer outro campo de acesso.
create or replace function public.update_my_profile(p_full_name text, p_phone text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_user_id is null then
    raise exception 'Sessão necessária.' using errcode = '28000';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe um nome entre 2 e 120 caracteres.' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 20 then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;
  update public.profiles
     set full_name = v_name, phone = v_phone, updated_at = now()
   where id = v_user_id;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;
