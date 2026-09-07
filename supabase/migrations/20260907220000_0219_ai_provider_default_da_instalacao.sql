-- 0219 — organização nova herda o provedor escolhido na instalação
--
-- A função anterior sempre escrevia Anthropic, mesmo quando o INSERT trazia
-- settings.llm.provider explícito. Isso deixava instalações OpenAI/OpenRouter
-- com provider e modelo de famílias diferentes. Não há backfill amplo: linhas
-- existentes podem representar uma escolha feita na tela e não são reescritas.

create or replace function public.fn_seed_org_llm_defaults()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_provider text;
  v_default_model text;
  v_llm jsonb;
begin
  v_provider := lower(coalesce(nullif(btrim(new.settings->'llm'->>'provider'), ''), 'anthropic'));
  if v_provider not in ('anthropic', 'openai', 'openrouter', 'google') then
    v_provider := 'anthropic';
  end if;

  v_llm := coalesce(new.settings->'llm', '{}'::jsonb)
    || jsonb_build_object('provider', v_provider);

  if coalesce(v_llm->>'default_model', '') = '' then
    select m.model_id
      into v_default_model
      from public.ai_models m
     where m.provider = v_provider
       and m.is_default_for_provider
       and m.deprecated_at is null
     order by m.model_id
     limit 1;

    v_llm := v_llm - 'default_model';
    if v_default_model is not null then
      v_llm := v_llm || jsonb_build_object('default_model', v_default_model);
    end if;
  end if;

  new.settings := jsonb_set(coalesce(new.settings, '{}'::jsonb), '{llm}', v_llm, true);
  return new;
end;
$$;

revoke execute on function public.fn_seed_org_llm_defaults() from public, anon, authenticated;
grant execute on function public.fn_seed_org_llm_defaults() to service_role;
