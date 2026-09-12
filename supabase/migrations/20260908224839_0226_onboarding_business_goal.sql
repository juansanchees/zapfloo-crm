-- ---- Segmento e objetivo no ensaio (migration 0226) ----
-- Campos opcionais para leitura de dados antigos, sem backfill ou nova taxonomia.
-- A revisão já invalida por configuração/revisão; negócio inclui segmento somente quando presente.
create or replace function public.fn_save_onboarding_draft(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_configuration jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  org public.organizations%rowtype;
  draft public.onboarding_drafts%rowtype;
  next_revision integer;
begin
  if p_expected_revision is null or p_expected_revision < 0
    or p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    raise exception 'draft_invalid_input';
  end if;
  if not (p_configuration ?& array['name','prompt_template','regras_da_casa'])
    or (p_configuration - array['name','prompt_template','regras_da_casa','objetivo']) <> '{}'::jsonb
    or (p_configuration ? 'objetivo' and jsonb_typeof(p_configuration->'objetivo') <> 'string')
    or jsonb_typeof(p_configuration->'name') <> 'string'
    or jsonb_typeof(p_configuration->'prompt_template') <> 'string'
    or jsonb_typeof(p_configuration->'regras_da_casa') <> 'string'
    or length(btrim(p_configuration->>'name')) not between 2 and 80
    or length(p_configuration->>'regras_da_casa') > 20000
    or p_configuration->>'prompt_template' not in
      ('ecommerce_friendly','ecommerce_professional','support_minimal') then
    raise exception 'draft_invalid_input';
  end if;
  -- Lock curto e por organização: nenhuma chamada de rede dentro da transação.
  select * into org from public.organizations where id=p_org_id for update;
  if not found then raise exception 'draft_forbidden'; end if;
  perform 1 from public.user_organizations
    where organization_id=p_org_id and user_id=p_actor_id and role='admin'
      and accepted_at is not null and revoked_at is null for share;
  if not found then raise exception 'draft_forbidden'; end if;
  if org.onboarded_at is not null or org.status <> 'active'
    or org.suspended_at is not null or org.redacted_at is not null then
    raise exception 'draft_unavailable';
  end if;
  select * into draft from public.onboarding_drafts where organization_id=p_org_id;
  -- Reenvio inofensivo: mesmo conteúdo já confirmado, nunca uma revisão futura.
  if found and p_expected_revision <= draft.revision
    and draft.configuration = p_configuration then
    return jsonb_build_object('revision',draft.revision,'configuration',draft.configuration);
  end if;
  if p_expected_revision <> coalesce(draft.revision,0) then
    raise exception 'draft_conflict';
  end if;
  next_revision := coalesce(draft.revision,0) + 1;
  insert into public.onboarding_drafts(organization_id,revision,configuration,updated_by)
    values(p_org_id,next_revision,p_configuration,p_actor_id)
    on conflict (organization_id) do update
      set revision=excluded.revision,configuration=excluded.configuration,
        updated_by=excluded.updated_by,updated_at=now();
  insert into public.api_audit_log
    (organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(p_org_id,p_actor_id,'onboarding.draft_saved','organization',p_org_id,
      jsonb_build_object('revision',next_revision));
  return jsonb_build_object('revision',next_revision,'configuration',p_configuration);
end;
$$;
revoke execute on function public.fn_save_onboarding_draft(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.fn_save_onboarding_draft(uuid,uuid,integer,jsonb) to service_role;
notify pgrst, 'reload schema';

create or replace function public.fn_prepare_onboarding_draft(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer,
  p_expected_version_id uuid, p_expected_business jsonb, p_version jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  org public.organizations%rowtype;
  draft public.onboarding_drafts%rowtype;
  agent public.ai_agents%rowtype;
  version public.ai_agent_versions%rowtype;
  business jsonb;
  request jsonb;
  credential uuid;
  tools text[];
  pipeline uuid;
  next_number integer;
begin
  if p_expected_revision is null or p_expected_revision < 1
    or p_expected_business is null or jsonb_typeof(p_expected_business) <> 'object'
    or p_version is null or jsonb_typeof(p_version) <> 'object' then
    raise exception 'draft_invalid_input';
  end if;
  if not (p_version ?& array['system_prompt','provider','model','credential_id','tool_ids'])
    or (p_version - array['system_prompt','provider','model','credential_id','tool_ids']) <> '{}'::jsonb
    or jsonb_typeof(p_version->'system_prompt') <> 'string'
    or length(btrim(p_version->>'system_prompt')) not between 10 and 20000
    or jsonb_typeof(p_version->'provider') <> 'string'
    or jsonb_typeof(p_version->'model') <> 'string'
    or length(btrim(p_version->>'model')) not between 1 and 120
    or jsonb_typeof(p_version->'tool_ids') <> 'array'
    or jsonb_typeof(p_version->'credential_id') not in ('null','string') then
    raise exception 'draft_invalid_input';
  end if;
  if jsonb_array_length(p_version->'tool_ids') > 25
    or exists(select 1 from jsonb_array_elements(p_version->'tool_ids') t where jsonb_typeof(t) <> 'string') then
    raise exception 'draft_invalid_input';
  end if;
  begin
    credential := (p_version->>'credential_id')::uuid;
  exception when invalid_text_representation then raise exception 'draft_invalid_input';
  end;
  select coalesce(array_agg(t), '{}'::text[]) into tools from jsonb_array_elements_text(p_version->'tool_ids') t;

  -- Ordem compatível com salvar: organização → vínculo → rascunho → agente → versão.
  -- Não há rede/IA dentro da transação.
  select * into org from public.organizations where id=p_org_id for update;
  if not found then raise exception 'draft_forbidden'; end if;
  perform 1 from public.user_organizations where organization_id=p_org_id
    and user_id=p_actor_id and role='admin' and accepted_at is not null and revoked_at is null for share;
  if not found then raise exception 'draft_forbidden'; end if;
  if org.onboarded_at is not null or org.status <> 'active'
    or org.suspended_at is not null or org.redacted_at is not null then
    raise exception 'draft_unavailable';
  end if;
  business := jsonb_build_object('display_name',coalesce(org.display_name,org.legal_name),
    'o_que_faz',case when jsonb_typeof(org.onboarding_state #> '{welcome,o_que_faz}')='string'
      then org.onboarding_state #> '{welcome,o_que_faz}' else 'null'::jsonb end);
  if jsonb_typeof(org.onboarding_state #> '{welcome,segmento}')='string' then
    business := business || jsonb_build_object('segmento',org.onboarding_state #>> '{welcome,segmento}');
  end if;
  if business is distinct from p_expected_business then raise exception 'draft_context_changed'; end if;
  select * into draft from public.onboarding_drafts where organization_id=p_org_id for update;
  if not found or draft.revision <> p_expected_revision then raise exception 'draft_conflict'; end if;

  -- Par explícito e disponível; nenhuma escolha de modelo/chave por fallback.
  perform 1 from public.ai_models where provider=p_version->>'provider' and model_id=p_version->>'model'
    and deprecated_at is null and (cardinality(tools)=0 or supports_tools) for share;
  if not found then raise exception 'draft_model_unavailable'; end if;
  if credential is not null then
    perform 1 from public.ai_provider_credentials where id=credential and organization_id=p_org_id
      and provider=p_version->>'provider' and is_active and validated_at is not null for share;
    if not found then raise exception 'draft_credential_unavailable'; end if;
  end if;

  request := jsonb_build_object('business',business,'version',p_version,'name',draft.configuration->>'name');
  if draft.prepared_agent_id is not null then
    select * into agent from public.ai_agents where id=draft.prepared_agent_id and organization_id=p_org_id for update;
    if not found or agent.is_active or agent.is_default or agent.published_version_id is not null
      or agent.archived_at is not null then raise exception 'draft_unavailable'; end if;
    select * into version from public.ai_agent_versions where id=draft.prepared_version_id
      and organization_id=p_org_id and agent_id=agent.id for update;
    -- O editor permite editar drafts. ID/revisão sozinhos não provam conteúdo.
    if not found or version.status <> 'draft' or to_jsonb(version) is distinct from draft.prepared_snapshot
      or agent.name is distinct from draft.prepared_request->>'name'
      or agent.system_prompt is distinct from draft.prepared_request #>> '{version,system_prompt}'
      or agent.model is distinct from draft.prepared_request #>> '{version,model}' then
      raise exception 'draft_conflict';
    end if;
    if draft.prepared_revision=p_expected_revision and draft.prepared_request=request then
      return jsonb_build_object('revision',draft.revision,'agent_id',agent.id,'version_id',version.id);
    end if;
  elsif draft.prepared_version_id is not null or draft.prepared_revision is not null then
    raise exception 'draft_unavailable';
  end if;
  if p_expected_version_id is distinct from draft.prepared_version_id then raise exception 'draft_conflict'; end if;
  if exists(select 1 from public.ai_agents where organization_id=p_org_id
    and name=draft.configuration->>'name' and id is distinct from draft.prepared_agent_id) then
    raise exception 'draft_name_conflict';
  end if;
  if agent.id is null then
    insert into public.ai_agents(organization_id,name,system_prompt,model,kind,is_active,is_default,created_by)
      values(p_org_id,draft.configuration->>'name',p_version->>'system_prompt',p_version->>'model','mcp_agent',false,false,p_actor_id)
      returning * into agent;
  else
    update public.ai_agents set name=draft.configuration->>'name',system_prompt=p_version->>'system_prompt',model=p_version->>'model'
      where id=agent.id and organization_id=p_org_id;
  end if;
  select id into pipeline from public.crm_pipelines where organization_id=p_org_id and is_default and not is_archived;
  select coalesce(max(version_number),0)+1 into next_number from public.ai_agent_versions where agent_id=agent.id and organization_id=p_org_id;
  insert into public.ai_agent_versions(organization_id,agent_id,version_number,system_prompt,provider,model,
    credential_id,tool_ids,pipeline_ids,channel_session_id,status,created_by)
    values(p_org_id,agent.id,next_number,p_version->>'system_prompt',p_version->>'provider',p_version->>'model',
      credential,tools,case when pipeline is null then '{}'::uuid[] else array[pipeline] end,null,'draft',p_actor_id)
    returning * into version;
  update public.onboarding_drafts set prepared_agent_id=agent.id,prepared_version_id=version.id,
    prepared_revision=draft.revision,prepared_request=request,prepared_snapshot=to_jsonb(version)
    where organization_id=p_org_id;
  insert into public.api_audit_log(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(p_org_id,p_actor_id,'onboarding.draft_prepared','ai_agent',agent.id,
      jsonb_build_object('revision',draft.revision,'version_id',version.id));
  return jsonb_build_object('revision',draft.revision,'agent_id',agent.id,'version_id',version.id);
end;
$$;
revoke execute on function public.fn_prepare_onboarding_draft(uuid,uuid,integer,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.fn_prepare_onboarding_draft(uuid,uuid,integer,uuid,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';

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
  if jsonb_typeof(org.onboarding_state #> '{welcome,segmento}')='string' then
    business := business || jsonb_build_object('segmento',org.onboarding_state #>> '{welcome,segmento}');
  end if;
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

notify pgrst, 'reload schema';
