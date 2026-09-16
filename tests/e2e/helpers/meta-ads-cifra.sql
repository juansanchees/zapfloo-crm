-- SOMENTE no Supabase local de QA, após baseline.sql. Não é migration.
-- O kit instala a chave via ensure_encryption_key; o baseline é schema-only.
-- Sem esta precondição o CI recebe NUVEMSHOP_OAUTH_ENCRYPTION_KEY ausente nos
-- três callbacks felizes. Não trocar a cifra real por mock nem gravar plaintext.
begin;
set local search_path = public, extensions, pg_temp;

-- Chave aleatória só desse banco descartável; reexecução NÃO rotaciona a existente.
insert into private.app_secrets (name, value)
values ('nuvemshop_oauth_key', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- Mesmas funções e mesmo papel do PostgREST. Não imprimir chave, cifra ou token.
set local role service_role;
do $$
declare
  controle constant text := 'controle-local-cifra-meta-ads';
  cifrado bytea;
begin
  cifrado := public.fn_encrypt_oauth(controle);
  if cifrado is null or public.fn_decrypt_oauth(cifrado) is distinct from controle then
    raise exception 'Precondição E2E: cifra OAuth não completou o round-trip';
  end if;
  raise notice 'Precondição E2E: cifra OAuth real pronta';
end $$;
commit;
