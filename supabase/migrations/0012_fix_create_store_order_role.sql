do $migration$
declare
  v_definition text;
  v_old text := $old$coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'$old$;
  v_new text := $new$coalesce(auth.role(), '') <> 'service_role'$new$;
begin
  select pg_get_functiondef(
    'public.create_store_order(jsonb,jsonb,text,text,text,text)'::regprocedure
  )
  into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Verificação antiga de autorização não encontrada. Nenhuma alteração realizada.';
  end if;

  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$migration$;
