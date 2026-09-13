-- Reparo genérico e idempotente de organizações ativadas antes da 0232.
-- Não escolhe "o primeiro agente": exige recibo de ativação + audit correspondente,
-- agente ainda ativo/não arquivado, a mesma versão publicada e snapshot íntegro.
-- O canal pode ter saído do pré-go-live desde a ativação; esta migration NÃO altera
-- canal, allowlist, publicação, estado ativo, filas, atendimento ou recibo.
-- Casos sem prova ficam intocados. Principal existente (mesmo arquivado) vence.
-- Data migration separada do DDL. Sem reversão automática: depois da promoção,
-- retirar a marca poderia desfazer uma escolha legítima mantida pelo operador.
-- Nenhum ID de organização/usuário/agente é fixado aqui; os NOTICE só têm contagens.

do $repair_onboarding_default$
declare
  v_item record;
  v_org public.organizations%rowtype;
  v_agent public.ai_agents%rowtype;
  v_version public.ai_agent_versions%rowtype;
  v_receipt jsonb;
  v_snapshot jsonb;
  v_agent_id uuid;
  v_version_id uuid;
  v_channel_id uuid;
  v_actor_id uuid;
  v_call_id uuid;
  v_run_id uuid;
  v_activated_at timestamptz;
  v_draft_revision integer;
  v_test_phone_count integer;
  v_constraint text;
  v_table text;
  v_schema text;
  v_changed integer;
  v_promoted integer := 0;
  v_existing_default integer := 0;
  v_missing_evidence integer := 0;
  v_archived_default integer := 0;
begin
  -- Conta, mas NÃO corrige: montarQuadro ainda pode ler o cérebro de um principal
  -- arquivado. Essa situação é preexistente e precisa de decisão em outro lote.
  select count(*)::integer into v_archived_default
    from public.ai_agents
   where is_default and archived_at is not null;

  -- Sem lock de tabela ou de organizações sem recibo. Os candidatos são relidos
  -- sob lock antes de qualquer decisão de escrita; a ativação usa o mesmo lock.
  for v_item in
    select id, onboarding_state from public.organizations order by id
  loop
    if exists (
      select 1 from public.ai_agents
       where organization_id = v_item.id and is_default
    ) then
      v_existing_default := v_existing_default + 1;
      continue;
    end if;
    if jsonb_typeof(v_item.onboarding_state #> '{ai,restricted_activation}')
      is distinct from 'object' then
      v_missing_evidence := v_missing_evidence + 1;
      continue;
    end if;

    select * into v_org
      from public.organizations where id = v_item.id for update;
    if not found then
      v_missing_evidence := v_missing_evidence + 1;
      continue;
    end if;
    if exists (
      select 1 from public.ai_agents
       where organization_id = v_org.id and is_default
    ) then
      v_existing_default := v_existing_default + 1;
      continue;
    end if;
    v_receipt := v_org.onboarding_state #> '{ai,restricted_activation}';
    if v_org.status is distinct from 'active' or v_org.suspended_at is not null
      or v_org.redacted_at is not null
      or jsonb_typeof(v_receipt) is distinct from 'object'
      or v_receipt->>'access_mode' is distinct from 'pre_go_live'
      or coalesce(v_receipt->>'snapshot_sha256', '') !~ '^[a-f0-9]{64}$'
      or coalesce(v_receipt->>'draft_revision', '') !~ '^[1-9][0-9]*$'
      or coalesce(v_receipt->>'test_phone_count', '') !~ '^[1-9][0-9]*$'
      or v_receipt->>'agent_id' is null or v_receipt->>'version_id' is null
      or v_receipt->>'channel_session_id' is null or v_receipt->>'actor_id' is null
      or v_receipt->>'call_id' is null or v_receipt->>'run_id' is null
      or v_receipt->>'activated_at' is null then
      v_missing_evidence := v_missing_evidence + 1;
      continue;
    end if;

    -- Recibo malformado é ausência de evidência, nunca erro que impede o update
    -- do clone. Só os erros de conversão destes campos são degradados.
    begin
      v_agent_id := (v_receipt->>'agent_id')::uuid;
      v_version_id := (v_receipt->>'version_id')::uuid;
      v_channel_id := (v_receipt->>'channel_session_id')::uuid;
      v_actor_id := (v_receipt->>'actor_id')::uuid;
      v_call_id := (v_receipt->>'call_id')::uuid;
      v_run_id := (v_receipt->>'run_id')::uuid;
      v_activated_at := (v_receipt->>'activated_at')::timestamptz;
      v_draft_revision := (v_receipt->>'draft_revision')::integer;
      v_test_phone_count := (v_receipt->>'test_phone_count')::integer;
    exception when invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow or numeric_value_out_of_range then
      v_missing_evidence := v_missing_evidence + 1;
      continue;
    end;

    select * into v_agent
      from public.ai_agents
     where id = v_agent_id and organization_id = v_org.id
     for update;
    select * into v_version
      from public.ai_agent_versions
     where id = v_version_id and organization_id = v_org.id
       and agent_id = v_agent_id
     for update;
    if v_agent.id is null or not v_agent.is_active
      or v_agent.archived_at is not null
      or v_agent.published_version_id is distinct from v_version_id
      or v_version.id is null or v_version.status is distinct from 'published'
      or v_version.channel_session_id is distinct from v_channel_id
      or v_version.published_at is distinct from v_activated_at
      or not exists (
        select 1 from public.channel_sessions
         where id = v_channel_id and organization_id = v_org.id
      ) then
      v_missing_evidence := v_missing_evidence + 1;
      continue;
    end if;

    v_snapshot := to_jsonb(v_version) || jsonb_build_object(
      'channel_session_id', null,
      'status', 'draft',
      'published_at', null,
      'superseded_at', null
    );
    if v_receipt->>'snapshot_sha256' is distinct from encode(
      extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex'
    ) or not exists (
      select 1 from public.api_audit_log audit
       where audit.organization_id = v_org.id
         and audit.action = 'onboarding.restricted_activation'
         and audit.resource_type = 'ai_agent'
         and audit.resource_id = v_agent_id
         and audit.actor_user_id = v_actor_id
         -- A ativação gravou o MESMO recibo no estado e no audit. Não basta
         -- encontrar um audit qualquer do agente, de outra versão ou de outra org.
         and audit.metadata = v_receipt
    ) then
      v_missing_evidence := v_missing_evidence + 1;
      continue;
    end if;

    begin
      update public.ai_agents candidate
         set is_default = true
       where candidate.id = v_agent_id
         and candidate.organization_id = v_org.id
         and not candidate.is_default
         and not exists (
           select 1 from public.ai_agents existing
            where existing.organization_id = v_org.id and existing.is_default
         );
      get diagnostics v_changed = row_count;
      if v_changed = 1 then
        v_promoted := v_promoted + 1;
      else
        v_existing_default := v_existing_default + 1;
      end if;
    exception when unique_violation then
      get stacked diagnostics
        v_constraint = constraint_name,
        v_table = table_name,
        v_schema = schema_name;
      if v_constraint is distinct from 'ai_agents_one_default_per_org'
        or v_table is distinct from 'ai_agents'
        or v_schema is distinct from 'public' then
        raise;
      end if;
      -- Outro escritor venceu depois do NOT EXISTS. Mantém a marca dele;
      -- nem a correção dos demais tenants nem o update da VPS são abortados.
      v_existing_default := v_existing_default + 1;
    end;
  end loop;

  raise notice 'onboarding_funcionario_principal: promovidas=%, ignoradas_por_default=%, ignoradas_por_falta_de_evidencia=%, defaults_arquivados=%',
    v_promoted, v_existing_default, v_missing_evidence, v_archived_default;
end;
$repair_onboarding_default$;
