-- ---- Ensaio de texto e revisão do onboarding (migration 0223) ----
-- Última execução apenas; conteúdo sintético, sem contatos, canais ou ferramentas.
alter table public.onboarding_drafts add column if not exists rehearsal jsonb;

-- Validação compartilhada. Locks curtos na ordem da 0222; nunca inclui rede.
create or replace function public.fn_validar_ensaio_onboarding(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_expected_version_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  org public.organizations%rowtype;
  draft public.onboarding_drafts%rowtype;
  agent public.ai_agents%rowtype;
  version public.ai_agent_versions%rowtype;
  business jsonb;
begin
  select * into org from public.organizations where id=p_org_id for update;
  if not found then raise exception 'draft_forbidden'; end if;
  perform 1 from public.user_organizations where organization_id=p_org_id and user_id=p_actor_id
    and role='admin' and accepted_at is not null and revoked_at is null for share;
  if not found then raise exception 'draft_forbidden'; end if;
  if org.onboarded_at is not null or org.status <> 'active' or org.suspended_at is not null or org.redacted_at is not null then
    raise exception 'draft_unavailable';
  end if;
  select * into draft from public.onboarding_drafts where organization_id=p_org_id for update;
  if not found or p_expected_revision is null or p_expected_version_id is null
    or draft.revision is distinct from p_expected_revision or draft.prepared_revision is distinct from draft.revision
    or draft.prepared_version_id is distinct from p_expected_version_id then raise exception 'draft_conflict'; end if;
  select * into agent from public.ai_agents where organization_id=p_org_id and id=draft.prepared_agent_id for update;
  if not found or agent.is_active or agent.is_default or agent.published_version_id is not null or agent.archived_at is not null then
    raise exception 'draft_unavailable';
  end if;
  select * into version from public.ai_agent_versions where organization_id=p_org_id and id=draft.prepared_version_id and agent_id=agent.id for update;
  if not found or version.status <> 'draft' or version.channel_session_id is not null
    or to_jsonb(version) is distinct from draft.prepared_snapshot
    or agent.name is distinct from draft.configuration->>'name'
    or agent.name is distinct from draft.prepared_request->>'name'
    or agent.system_prompt is distinct from version.system_prompt or agent.model is distinct from version.model then
    raise exception 'draft_conflict';
  end if;
  business := jsonb_build_object('display_name',coalesce(org.display_name,org.legal_name),
    'o_que_faz',case when jsonb_typeof(org.onboarding_state #> '{welcome,o_que_faz}')='string'
      then org.onboarding_state #> '{welcome,o_que_faz}' else 'null'::jsonb end);
  if business is distinct from draft.prepared_request->'business' then raise exception 'draft_context_changed'; end if;
  perform 1 from public.ai_models where provider=version.provider and model_id=version.model and deprecated_at is null for share;
  if not found then raise exception 'draft_model_unavailable'; end if;
  if version.credential_id is not null then
    perform 1 from public.ai_provider_credentials where id=version.credential_id and organization_id=p_org_id
      and provider=version.provider and is_active and validated_at is not null for share;
    if not found then raise exception 'draft_credential_unavailable'; end if;
  end if;
  return draft.prepared_snapshot;
end;
$$;
revoke execute on function public.fn_validar_ensaio_onboarding(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.fn_validar_ensaio_onboarding(uuid,uuid,integer,uuid) to service_role;

-- Toda alteração de configuração/preparação retira a prova, inclusive antes de nova preparação.
create or replace function public.fn_invalidar_ensaio_onboarding()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.configuration is distinct from old.configuration or new.revision is distinct from old.revision
    or new.prepared_snapshot is distinct from old.prepared_snapshot then new.rehearsal := null; end if;
  return new;
end;
$$;
revoke execute on function public.fn_invalidar_ensaio_onboarding() from public, anon, authenticated;
grant execute on function public.fn_invalidar_ensaio_onboarding() to service_role;
drop trigger if exists onboarding_rehearsal_invalidated on public.onboarding_drafts;
create trigger onboarding_rehearsal_invalidated before update on public.onboarding_drafts
  for each row execute function public.fn_invalidar_ensaio_onboarding();

create or replace function public.fn_iniciar_ensaio_onboarding(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_expected_version_id uuid, p_sample_message text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; run jsonb;
begin
  -- Limite técnico de payload da prévia, não regra do atendimento.
  if p_sample_message is null or length(btrim(p_sample_message)) not between 1 and 4000 then raise exception 'draft_invalid_input'; end if;
  snapshot := public.fn_validar_ensaio_onboarding(p_org_id,p_actor_id,p_expected_revision,p_expected_version_id);
  select rehearsal into run from public.onboarding_drafts where organization_id=p_org_id;
  -- Lease técnico de 60s: maior que o timeout de rede de 30s; retry recupera processo interrompido.
  if run->>'status'='running' and (run->>'started_at')::timestamptz > now()-interval '60 seconds' then
    raise exception 'rehearsal_busy';
  end if;
  run := jsonb_build_object('run_id',gen_random_uuid(),'revision',p_expected_revision,'version_id',p_expected_version_id,
    'snapshot',snapshot,'sample_message',btrim(p_sample_message),'status','running','response',null,'call_id',null,
    'error',null,'reviewed',false,'started_at',now());
  update public.onboarding_drafts set rehearsal=run where organization_id=p_org_id;
  insert into public.api_audit_log(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(p_org_id,p_actor_id,'onboarding.rehearsal_started','ai_agent',(snapshot->>'agent_id')::uuid,
      jsonb_build_object('run_id',run->'run_id','version_id',p_expected_version_id));
  return jsonb_build_object('run_id',run->'run_id','snapshot',snapshot);
end;
$$;
revoke execute on function public.fn_iniciar_ensaio_onboarding(uuid,uuid,integer,uuid,text) from public, anon, authenticated;
grant execute on function public.fn_iniciar_ensaio_onboarding(uuid,uuid,integer,uuid,text) to service_role;

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
  elsif p_error not in ('not_configured','budget_exceeded','provider_error','empty_response','incomplete_response') then
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
revoke execute on function public.fn_finalizar_ensaio_onboarding(uuid,uuid,integer,uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.fn_finalizar_ensaio_onboarding(uuid,uuid,integer,uuid,uuid,text,uuid,text) to service_role;

create or replace function public.fn_revisar_ensaio_onboarding(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_expected_version_id uuid, p_run_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; run jsonb;
begin
  snapshot := public.fn_validar_ensaio_onboarding(p_org_id,p_actor_id,p_expected_revision,p_expected_version_id);
  select rehearsal into run from public.onboarding_drafts where organization_id=p_org_id;
  if run is null or p_run_id is null or run->>'run_id' is distinct from p_run_id::text
    or run->'snapshot' is distinct from snapshot then raise exception 'rehearsal_conflict'; end if;
  if run->>'status' <> 'completed' or coalesce(length(btrim(run->>'response')),0)=0 or run->>'call_id' is null then
    raise exception 'rehearsal_not_completed';
  end if;
  if not (run->>'reviewed')::boolean then
    run := run || jsonb_build_object('reviewed',true);
    update public.onboarding_drafts set rehearsal=run where organization_id=p_org_id;
    insert into public.api_audit_log(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
      values(p_org_id,p_actor_id,'onboarding.rehearsal_reviewed','ai_agent',(snapshot->>'agent_id')::uuid,
        jsonb_build_object('run_id',p_run_id,'version_id',p_expected_version_id));
  end if;
  return run - 'snapshot' - 'started_at';
end;
$$;
revoke execute on function public.fn_revisar_ensaio_onboarding(uuid,uuid,integer,uuid,uuid) from public, anon, authenticated;
grant execute on function public.fn_revisar_ensaio_onboarding(uuid,uuid,integer,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
