-- ---- Revisão confirmada e ativação restrita do onboarding (migration 0224) ----
--
-- Confirmar consome a revisão corrente sem publicar. Ativar revalida tudo e
-- publica, vincula e ativa o MESMO agente preparado numa única transação.
-- Nenhuma função executa IA, ferramenta, mensagem, HTTP ou evento proativo.

create or replace function public.fn_confirmar_agente_revisado_onboarding(
  p_org_id uuid,
  p_actor_id uuid,
  p_expected_revision integer,
  p_expected_version_id uuid,
  p_run_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_draft public.onboarding_drafts%rowtype;
  v_snapshot jsonb;
  v_run jsonb;
  v_ai jsonb;
  v_marker jsonb;
begin
  if p_org_id is null or p_actor_id is null or p_expected_revision is null
    or p_expected_revision < 1 or p_expected_version_id is null or p_run_id is null then
    raise exception 'draft_invalid_input';
  end if;

  -- Reusa locks, RBAC, estado da organização, CAS, negócio, agente, versão,
  -- modelo e credencial da 0223 antes de gravar qualquer marcador.
  v_snapshot := public.fn_validar_ensaio_onboarding(
    p_org_id, p_actor_id, p_expected_revision, p_expected_version_id
  );
  select * into v_org from public.organizations where id = p_org_id for update;
  select * into v_draft from public.onboarding_drafts where organization_id = p_org_id for update;
  v_run := v_draft.rehearsal;

  if v_run is null or v_run->>'run_id' is distinct from p_run_id::text
    or v_run->>'revision' is distinct from p_expected_revision::text
    or v_run->>'version_id' is distinct from p_expected_version_id::text
    or v_run->'snapshot' is distinct from v_snapshot then
    raise exception 'rehearsal_conflict';
  end if;
  if v_run->>'status' <> 'completed' or coalesce(length(btrim(v_run->>'response')), 0) = 0
    or v_run->>'call_id' is null or coalesce((v_run->>'reviewed')::boolean, false) is not true then
    raise exception 'rehearsal_not_completed';
  end if;
  perform 1
    from public.llm_calls llm
   where llm.id = (v_run->>'call_id')::uuid
     and llm.organization_id = p_org_id
     and llm.agent_id = (v_snapshot->>'agent_id')::uuid
     and llm.purpose = 'onboarding_rehearsal'
     and llm.status = 'ok'
     and llm.provider = v_snapshot->>'provider'
     and llm.model = v_snapshot->>'model'
     and llm.created_at >= (v_run->>'started_at')::timestamptz;
  if not found then raise exception 'rehearsal_invalid_result'; end if;

  v_ai := case when jsonb_typeof(v_org.onboarding_state->'ai') = 'object'
    then v_org.onboarding_state->'ai' else '{}'::jsonb end;
  v_marker := jsonb_build_object(
    'flow', 'reviewed_draft_v2',
    'revision', p_expected_revision,
    'agent_id', v_snapshot->>'agent_id',
    'version_id', p_expected_version_id,
    'run_id', p_run_id,
    'review_confirmed_at', now()
  );

  -- Retry da MESMA prova não regrava timestamp nem duplica audit.
  if v_ai->>'flow' = 'reviewed_draft_v2'
    and v_ai->>'revision' = p_expected_revision::text
    and v_ai->>'agent_id' = v_snapshot->>'agent_id'
    and v_ai->>'version_id' = p_expected_version_id::text
    and v_ai->>'run_id' = p_run_id::text then
    return jsonb_build_object(
      'agent_id', v_snapshot->>'agent_id',
      'version_id', p_expected_version_id
    );
  end if;

  update public.organizations
     set onboarding_state = coalesce(onboarding_state, '{}'::jsonb)
       || jsonb_build_object('ai', v_ai || v_marker)
   where id = p_org_id;

  insert into public.api_audit_log(
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_org_id, p_actor_id, 'onboarding.review_confirmed', 'ai_agent',
    (v_snapshot->>'agent_id')::uuid,
    jsonb_build_object(
      'revision', p_expected_revision,
      'version_id', p_expected_version_id,
      'run_id', p_run_id
    )
  );

  return jsonb_build_object(
    'agent_id', v_snapshot->>'agent_id',
    'version_id', p_expected_version_id
  );
end;
$$;

revoke execute on function public.fn_confirmar_agente_revisado_onboarding(uuid,uuid,integer,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.fn_confirmar_agente_revisado_onboarding(uuid,uuid,integer,uuid,uuid)
  to service_role;

create or replace function public.fn_ativar_agente_teste_onboarding(
  p_org_id uuid,
  p_actor_id uuid,
  p_expected_revision integer,
  p_expected_version_id uuid,
  p_run_id uuid,
  p_channel_session_id uuid,
  p_installation_key_available boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_draft public.onboarding_drafts%rowtype;
  v_agent public.ai_agents%rowtype;
  v_version public.ai_agent_versions%rowtype;
  v_channel public.channel_sessions%rowtype;
  v_snapshot jsonb;
  v_run jsonb;
  v_ai jsonb;
  v_whatsapp jsonb;
  v_confirmation jsonb;
  v_receipt jsonb;
  v_numbers jsonb;
  v_snapshot_sha256 text;
  v_activated_at timestamptz := now();
begin
  if p_org_id is null or p_actor_id is null or p_expected_revision is null
    or p_expected_revision < 1 or p_expected_version_id is null or p_run_id is null
    or p_channel_session_id is null or p_installation_key_available is null then
    raise exception 'draft_invalid_input';
  end if;

  -- Ordem estável: organização → vínculo → draft → agente → versão → canal.
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then raise exception 'draft_forbidden'; end if;
  perform 1
    from public.user_organizations membership
   where membership.organization_id = p_org_id
     and membership.user_id = p_actor_id
     and membership.role = 'admin'
     and membership.accepted_at is not null
     and membership.revoked_at is null
   for share;
  if not found then raise exception 'draft_forbidden'; end if;
  if v_org.onboarded_at is not null or v_org.status <> 'active'
    or v_org.suspended_at is not null or v_org.redacted_at is not null then
    raise exception 'draft_unavailable';
  end if;
  select * into v_draft
    from public.onboarding_drafts
   where organization_id = p_org_id
   for update;
  if not found then raise exception 'draft_conflict'; end if;

  v_ai := case when jsonb_typeof(v_org.onboarding_state->'ai') = 'object'
    then v_org.onboarding_state->'ai' else '{}'::jsonb end;
  v_receipt := v_ai->'restricted_activation';

  -- A prova histórica é o caminho de retry pós-publicação. O validador da 0223
  -- deve continuar recusando versões já publicadas; não o afrouxamos.
  if jsonb_typeof(v_receipt) = 'object' then
    if v_receipt->>'draft_revision' is distinct from p_expected_revision::text
      or v_receipt->>'run_id' is distinct from p_run_id::text
      or v_receipt->>'version_id' is distinct from p_expected_version_id::text
      or v_receipt->>'channel_session_id' is distinct from p_channel_session_id::text
      or v_receipt->>'agent_id' is null then
      raise exception 'activation_conflict';
    end if;
    begin
      select * into v_agent
        from public.ai_agents
       where id = (v_receipt->>'agent_id')::uuid and organization_id = p_org_id
       for update;
      select * into v_version
        from public.ai_agent_versions
       where id = p_expected_version_id and organization_id = p_org_id
         and agent_id = (v_receipt->>'agent_id')::uuid
       for update;
    exception when invalid_text_representation then
      raise exception 'activation_conflict';
    end;
    select * into v_channel
      from public.channel_sessions
     where id = p_channel_session_id and organization_id = p_org_id
     for update;
    v_numbers := v_channel.metadata->'ai_test_phone_numbers';
    if v_agent.id is null or v_agent.archived_at is not null or not v_agent.is_active
      or v_agent.published_version_id is distinct from p_expected_version_id
      or v_version.id is null or v_version.status <> 'published'
      or v_version.channel_session_id is distinct from p_channel_session_id
      or v_channel.id is null or v_channel.archived_at is not null or v_channel.status <> 'WORKING'
      or v_channel.metadata->>'ai_gate' <> 'allowlist'
      or v_channel.metadata->>'ai_gate_mode' <> 'pre_go_live'
      or jsonb_typeof(v_numbers) <> 'array' then
      raise exception 'activation_conflict';
    end if;
    if jsonb_array_length(v_numbers) < 1 or exists (
      select 1
        from jsonb_array_elements(v_numbers) item
       where jsonb_typeof(item) <> 'string'
          or (item #>> '{}') !~ '^\+[1-9][0-9]{7,14}$'
    ) then
      raise exception 'activation_conflict';
    end if;
    perform 1
      from public.api_audit_log audit
     where audit.organization_id = p_org_id
       and audit.action = 'onboarding.restricted_activation'
       and audit.resource_id = (v_receipt->>'agent_id')::uuid
       and audit.metadata->>'version_id' = p_expected_version_id::text
       and audit.metadata->>'run_id' = p_run_id::text
       and audit.metadata->>'channel_session_id' = p_channel_session_id::text;
    if not found then raise exception 'activation_conflict'; end if;
    return jsonb_build_object(
      'agent_id', v_receipt->>'agent_id',
      'version_id', p_expected_version_id,
      'channel_session_id', p_channel_session_id,
      'activated_at', v_receipt->>'activated_at'
    );
  elsif v_receipt is not null then
    raise exception 'activation_conflict';
  end if;

  -- Prova corrente: depois desta chamada nenhuma mutação ocorreu ainda.
  v_snapshot := public.fn_validar_ensaio_onboarding(
    p_org_id, p_actor_id, p_expected_revision, p_expected_version_id
  );
  select * into v_draft from public.onboarding_drafts where organization_id = p_org_id for update;
  v_run := v_draft.rehearsal;
  v_confirmation := v_ai;

  if v_confirmation->>'flow' <> 'reviewed_draft_v2'
    or v_confirmation->>'revision' is distinct from p_expected_revision::text
    or v_confirmation->>'agent_id' is distinct from v_snapshot->>'agent_id'
    or v_confirmation->>'version_id' is distinct from p_expected_version_id::text
    or v_confirmation->>'run_id' is distinct from p_run_id::text then
    raise exception 'activation_conflict';
  end if;
  if v_run is null or v_run->>'run_id' is distinct from p_run_id::text
    or v_run->>'revision' is distinct from p_expected_revision::text
    or v_run->>'version_id' is distinct from p_expected_version_id::text
    or v_run->'snapshot' is distinct from v_snapshot then
    raise exception 'rehearsal_conflict';
  end if;
  if v_run->>'status' <> 'completed' or coalesce(length(btrim(v_run->>'response')), 0) = 0
    or v_run->>'call_id' is null or coalesce((v_run->>'reviewed')::boolean, false) is not true then
    raise exception 'rehearsal_not_completed';
  end if;
  perform 1
    from public.llm_calls llm
   where llm.id = (v_run->>'call_id')::uuid
     and llm.organization_id = p_org_id
     and llm.agent_id = (v_snapshot->>'agent_id')::uuid
     and llm.purpose = 'onboarding_rehearsal'
     and llm.status = 'ok'
     and llm.provider = v_snapshot->>'provider'
     and llm.model = v_snapshot->>'model'
     and llm.created_at >= (v_run->>'started_at')::timestamptz;
  if not found then raise exception 'rehearsal_invalid_result'; end if;

  select * into v_agent
    from public.ai_agents
   where id = (v_snapshot->>'agent_id')::uuid and organization_id = p_org_id
   for update;
  select * into v_version
    from public.ai_agent_versions
   where id = p_expected_version_id and organization_id = p_org_id
     and agent_id = (v_snapshot->>'agent_id')::uuid
   for update;
  if v_agent.id is null or v_agent.is_active or v_agent.is_default
    or v_agent.published_version_id is not null or v_agent.archived_at is not null
    or v_version.id is null or v_version.status <> 'draft'
    or v_version.channel_session_id is not null or to_jsonb(v_version) is distinct from v_snapshot then
    raise exception 'draft_conflict';
  end if;

  select * into v_channel
    from public.channel_sessions
   where id = p_channel_session_id and organization_id = p_org_id
   for update;
  if not found or v_channel.archived_at is not null or v_channel.status <> 'WORKING' then
    raise exception 'activation_channel_unavailable';
  end if;
  if v_channel.metadata->>'ai_gate' <> 'allowlist'
    or v_channel.metadata->>'ai_gate_mode' <> 'pre_go_live' then
    raise exception 'activation_channel_not_restricted';
  end if;
  v_numbers := v_channel.metadata->'ai_test_phone_numbers';
  if jsonb_typeof(v_numbers) <> 'array' then
    raise exception 'activation_channel_not_restricted';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_numbers) item
     where jsonb_typeof(item) <> 'string'
        or (item #>> '{}') !~ '^\+[1-9][0-9]{7,14}$'
  ) or jsonb_array_length(v_numbers) = 0 then
    raise exception 'activation_channel_not_restricted';
  end if;

  perform 1
    from public.ai_models model
   where model.provider = v_version.provider
     and model.model_id = v_version.model
     and model.deprecated_at is null
     and (cardinality(v_version.tool_ids) = 0 or model.supports_tools)
   for share;
  if not found or length(btrim(v_version.system_prompt)) not between 10 and 20000
    or length(btrim(v_version.provider)) = 0 or length(btrim(v_version.model)) not between 1 and 120 then
    raise exception 'activation_model_unavailable';
  end if;

  if v_version.credential_id is null then
    if not p_installation_key_available then
      raise exception 'activation_credential_unavailable';
    end if;
  else
    perform 1
      from public.ai_provider_credentials credential
     where credential.id = v_version.credential_id
       and credential.organization_id = p_org_id
       and credential.provider = v_version.provider
       and credential.is_active
       and credential.validated_at is not null
     for share;
    if not found then raise exception 'activation_credential_unavailable'; end if;
  end if;

  -- Não rouba o canal de outro agente em atendimento. Agente default existente
  -- também é preservado: o preparado continua não-default.
  perform 1
    from public.ai_agents other_agent
    join public.ai_agent_versions published
      on published.id = other_agent.published_version_id
     and published.organization_id = p_org_id
   where other_agent.organization_id = p_org_id
     and other_agent.id <> v_agent.id
     and other_agent.is_active
     and other_agent.archived_at is null
     and published.status = 'published'
     and published.channel_session_id = p_channel_session_id
   for update of other_agent, published;
  if found then raise exception 'activation_agent_conflict'; end if;

  v_snapshot_sha256 := encode(
    extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  update public.ai_agent_versions
     set channel_session_id = p_channel_session_id,
         status = 'published',
         published_at = v_activated_at,
         superseded_at = null
   where id = p_expected_version_id and organization_id = p_org_id;
  update public.ai_agents
     set is_active = true,
         published_version_id = p_expected_version_id,
         updated_at = v_activated_at
   where id = v_agent.id and organization_id = p_org_id;

  v_receipt := jsonb_build_object(
    'draft_revision', p_expected_revision,
    'run_id', p_run_id,
    'call_id', v_run->>'call_id',
    'agent_id', v_agent.id,
    'version_id', p_expected_version_id,
    'channel_session_id', p_channel_session_id,
    'snapshot_sha256', v_snapshot_sha256,
    'access_mode', 'pre_go_live',
    'test_phone_count', jsonb_array_length(v_numbers),
    'activated_at', v_activated_at,
    'actor_id', p_actor_id
  );
  v_whatsapp := case when jsonb_typeof(v_org.onboarding_state->'whatsapp') = 'object'
    then v_org.onboarding_state->'whatsapp' else '{}'::jsonb end;

  update public.organizations
     set onboarding_state = coalesce(onboarding_state, '{}'::jsonb)
       || jsonb_build_object(
         'ai', v_ai || jsonb_build_object('restricted_activation', v_receipt),
         'whatsapp', v_whatsapp || jsonb_build_object(
           'channel_session_id', p_channel_session_id,
           'status', 'restricted_active',
           'activated_at', v_activated_at
         )
       )
   where id = p_org_id;

  insert into public.api_audit_log(
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_org_id, p_actor_id, 'onboarding.restricted_activation', 'ai_agent', v_agent.id,
    jsonb_build_object(
      'draft_revision', p_expected_revision,
      'run_id', p_run_id,
      'call_id', v_run->>'call_id',
      'agent_id', v_agent.id,
      'version_id', p_expected_version_id,
      'channel_session_id', p_channel_session_id,
      'snapshot_sha256', v_snapshot_sha256,
      'access_mode', 'pre_go_live',
      'test_phone_count', jsonb_array_length(v_numbers),
      'activated_at', v_activated_at,
      'actor_id', p_actor_id
    )
  );

  return jsonb_build_object(
    'agent_id', v_agent.id,
    'version_id', p_expected_version_id,
    'channel_session_id', p_channel_session_id,
    'activated_at', v_activated_at
  );
end;
$$;

revoke execute on function public.fn_ativar_agente_teste_onboarding(uuid,uuid,integer,uuid,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.fn_ativar_agente_teste_onboarding(uuid,uuid,integer,uuid,uuid,uuid,boolean)
  to service_role;

comment on function public.fn_ativar_agente_teste_onboarding(uuid,uuid,integer,uuid,uuid,uuid,boolean) is
  'Publica somente o draft de onboarding revisado, num canal WORKING fechado em pre_go_live com allowlist não vazia. Não executa IA, ferramentas, mensagens, HTTP ou eventos.';

notify pgrst, 'reload schema';
