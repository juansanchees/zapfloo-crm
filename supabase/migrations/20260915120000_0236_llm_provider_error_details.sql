-- 0236 — preservar o motivo que o provedor devolveu sem trocar o vocabulário
-- normalizado já consumido pelas telas e relatórios.
--
-- `error_code` continua sendo a classificação estável do Zapfloo. As colunas
-- novas guardam apenas identificadores técnicos seguros (nunca corpo, prompt ou
-- segredo) e o motivo de término do SDK.

alter table public.llm_calls
  add column if not exists provider_error_type text,
  add column if not exists provider_error_code text,
  add column if not exists finish_reason text;

comment on column public.llm_calls.provider_error_type is
  'Tipo seguro devolvido pelo provedor (ex.: insufficient_quota), sem corpo da resposta.';
comment on column public.llm_calls.provider_error_code is
  'Código seguro devolvido pelo provedor (ex.: credit_balance_exhausted), sem segredo ou prompt.';
comment on column public.llm_calls.finish_reason is
  'Motivo de término devolvido pelo SDK/provedor; presente também em respostas incompletas.';

-- Duas organizações podem descobrir o saldo esgotado no mesmo instante. O
-- índice torna a deduplicação do alerta global atômica; depois de resolvido,
-- uma nova falta de saldo pode abrir outro incidente.
create unique index if not exists incidents_ai_provider_balance_open_unique
  on public.incidents ((payload->>'provider'))
  where organization_id is null
    and type = 'ai_provider_balance_exhausted'
    and status <> 'resolved';

-- Se o modelo principal for recusado, o ensaio pode provar um modelo reserva.
-- Esta RPC adota o modelo provado no MESMO snapshot que será publicado; sem
-- isso a tela ficaria verde, mas o atendimento real continuaria no modelo
-- recusado. A validação canônica mantém os locks e o vínculo org/ator/revisão.
create or replace function public.fn_adotar_modelo_reserva_ensaio(
  p_org_id uuid,
  p_actor_id uuid,
  p_expected_revision integer,
  p_expected_version_id uuid,
  p_run_id uuid,
  p_model_used text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_new_snapshot jsonb;
  v_run jsonb;
  v_version public.ai_agent_versions%rowtype;
begin
  v_snapshot := public.fn_validar_ensaio_onboarding(
    p_org_id, p_actor_id, p_expected_revision, p_expected_version_id
  );

  select rehearsal
    into v_run
    from public.onboarding_drafts
   where organization_id = p_org_id
   for update;

  if v_run is null
    or p_run_id is null
    or v_run->>'run_id' is distinct from p_run_id::text
    or v_run->>'status' <> 'running'
    or v_run->'snapshot' is distinct from v_snapshot
    or p_model_used is null
    or btrim(p_model_used) = '' then
    raise exception 'rehearsal_conflict';
  end if;

  if p_model_used = v_snapshot->>'model' then
    return v_snapshot;
  end if;

  perform 1
    from public.ai_models
   where provider = v_snapshot->>'provider'
     and model_id = p_model_used
     and deprecated_at is null
     and supports_tools is true
   for share;
  if not found then
    raise exception 'draft_model_unavailable';
  end if;

  update public.ai_agent_versions
     set model = p_model_used
   where id = p_expected_version_id
     and organization_id = p_org_id
     and agent_id = (v_snapshot->>'agent_id')::uuid
     and status = 'draft';
  if not found then
    raise exception 'rehearsal_conflict';
  end if;

  update public.ai_agents
     set model = p_model_used
   where id = (v_snapshot->>'agent_id')::uuid
     and organization_id = p_org_id
     and is_active is false
     and is_default is false
     and published_version_id is null
     and archived_at is null;
  if not found then
    raise exception 'rehearsal_conflict';
  end if;

  select *
    into v_version
    from public.ai_agent_versions
   where id = p_expected_version_id
     and organization_id = p_org_id;
  v_new_snapshot := to_jsonb(v_version);
  v_run := jsonb_set(v_run, '{snapshot}', v_new_snapshot, true)
    || jsonb_build_object('model_used', p_model_used);

  -- A primeira escrita aciona a invalidação normal do ensaio. A segunda
  -- recoloca somente o lease corrente, já ligado ao snapshot novo.
  update public.onboarding_drafts
     set prepared_snapshot = v_new_snapshot
   where organization_id = p_org_id;
  update public.onboarding_drafts
     set rehearsal = v_run
   where organization_id = p_org_id;

  insert into public.api_audit_log(
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_org_id, p_actor_id, 'onboarding.rehearsal_fallback_adopted',
    'ai_agent', (v_snapshot->>'agent_id')::uuid,
    jsonb_build_object(
      'run_id', p_run_id,
      'version_id', p_expected_version_id,
      'previous_model', v_snapshot->>'model',
      'model_used', p_model_used
    )
  );

  return v_new_snapshot;
end;
$$;

revoke execute on function public.fn_adotar_modelo_reserva_ensaio(uuid, uuid, integer, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fn_adotar_modelo_reserva_ensaio(uuid, uuid, integer, uuid, uuid, text)
  to service_role;

-- A 0223 conhecia apenas o vocabulário de falhas original. Sem esta reposição,
-- causas novas e explícitas seriam recusadas como rehearsal_invalid_result.
create or replace function public.fn_finalizar_ensaio_onboarding(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_expected_version_id uuid,
  p_run_id uuid, p_response text, p_call_id uuid, p_error text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; run jsonb;
begin
  snapshot := public.fn_validar_ensaio_onboarding(p_org_id,p_actor_id,p_expected_revision,p_expected_version_id);
  select rehearsal into run from public.onboarding_drafts where organization_id=p_org_id;
  if run is null or p_run_id is null or run->>'run_id' is distinct from p_run_id::text
    or run->>'status' <> 'running' or run->'snapshot' is distinct from snapshot then raise exception 'rehearsal_conflict'; end if;
  if p_error is null then
    if p_response is null or length(btrim(p_response)) not between 1 and 12000 or p_call_id is null then raise exception 'rehearsal_invalid_result'; end if;
    perform 1 from public.llm_calls where id=p_call_id and organization_id=p_org_id
      and agent_id=(snapshot->>'agent_id')::uuid and purpose='onboarding_rehearsal' and status='ok'
      and model=snapshot->>'model' and provider=snapshot->>'provider'
      and created_at >= (run->>'started_at')::timestamptz;
    if not found then raise exception 'rehearsal_invalid_result'; end if;
  elsif p_error not in (
    'not_configured','budget_exceeded','provider_credential','provider_quota',
    'provider_model','provider_timeout','provider_error','empty_response','incomplete_response'
  ) then
    raise exception 'rehearsal_invalid_result';
  end if;
  run := run || jsonb_build_object('status',case when p_error is null then 'completed' else 'failed' end,
    'response',case when p_error is null then btrim(p_response) else null end,'call_id',p_call_id,'error',p_error,'reviewed',false);
  update public.onboarding_drafts set rehearsal=run where organization_id=p_org_id;
  insert into public.api_audit_log(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(p_org_id,p_actor_id,'onboarding.rehearsal_finished','ai_agent',(snapshot->>'agent_id')::uuid,
      jsonb_build_object('run_id',p_run_id,'status',run->'status','call_id',p_call_id,'error',p_error));
  return run - 'snapshot' - 'started_at';
end;
$$;
revoke execute on function public.fn_finalizar_ensaio_onboarding(uuid,uuid,integer,uuid,uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fn_finalizar_ensaio_onboarding(uuid,uuid,integer,uuid,uuid,text,uuid,text)
  to service_role;

-- A mesma transição que libera/configura a IA grava um marco. Os consumidores
-- comparam a mensagem a este instante para não drenar conversa anterior.
create or replace function public.fn_configurar_pre_go_live_canal(
  p_org uuid,
  p_canal uuid,
  p_modo text,
  p_numeros text[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linhas integer;
  v_gate text;
begin
  if p_modo is null or p_modo not in ('open', 'pre_go_live') then
    raise exception 'modo de acesso da IA inválido' using errcode = '22023';
  end if;

  if p_numeros is null or exists (
    select 1
      from unnest(p_numeros) as n(numero)
     where numero is null or numero !~ '^\+[1-9][0-9]{7,14}$'
  ) then
    raise exception 'lista de telefones de teste inválida' using errcode = '22023';
  end if;

  v_gate := case when p_modo = 'pre_go_live' then 'allowlist' else 'open' end;

  update public.channel_sessions
     set metadata = jsonb_set(
       jsonb_set(
         jsonb_set(
           jsonb_set(coalesce(metadata, '{}'::jsonb), '{ai_gate}', to_jsonb(v_gate), true),
           '{ai_gate_mode}', to_jsonb('pre_go_live'::text), true
         ),
         '{ai_test_phone_numbers}', to_jsonb(p_numeros), true
       ),
       '{ai_gate_started_at}', to_jsonb(now()), true
     )
   where organization_id = p_org
     and id = p_canal
     and archived_at is null;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

comment on function public.fn_configurar_pre_go_live_canal(uuid, uuid, text, text[]) is
  'Configura o gate sem sobrescrever metadata de transporte e marca o instante a partir do qual mensagens novas podem disparar a IA.';

revoke execute on function public.fn_configurar_pre_go_live_canal(uuid, uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public.fn_configurar_pre_go_live_canal(uuid, uuid, text, text[])
  to service_role;
