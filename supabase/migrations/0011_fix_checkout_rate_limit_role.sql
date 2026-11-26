create or replace function public.consume_checkout_rate_limit(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  insert into public.checkout_rate_limits as existing
    (fingerprint, window_started_at, attempts)
  values
    (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update set
    attempts = case
      when existing.window_started_at < now() - interval '15 minutes'
      then 1
      else existing.attempts + 1
    end,
    window_started_at = case
      when existing.window_started_at < now() - interval '15 minutes'
      then now()
      else existing.window_started_at
    end
  returning attempts into v_attempts;

  return v_attempts <= 5;
end;
$$;

revoke all on function public.consume_checkout_rate_limit(text)
from public, anon, authenticated;

grant execute on function public.consume_checkout_rate_limit(text)
to service_role;
