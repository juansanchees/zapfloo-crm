-- ---- Recuperação explícita da preparação indisponível (migration 0228) ----
-- Preserva o agente arquivado e o texto salvo. Não publica, não reativa e não chama IA.
create or replace function public.fn_recuperar_preparacao_onboarding(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_expected_version_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  org public.organizations%rowtype;
  draft public.onboarding_drafts%rowtype;
  agent public.ai_agents%rowtype;
begin
  if p_expected_revision is null or p_expected_revision < 1 then raise exception 'draft_invalid_input'; end if;
  select * into org from public.organizations where id=p_org_id for update;
  if not found then raise exception 'draft_forbidden'; end if;
  perform 1 from public.user_organizations where organization_id=p_org_id and user_id=p_actor_id
    and role='admin' and accepted_at is not null and revoked_at is null for share;
  if not found then raise exception 'draft_forbidden'; end if;
  if org.onboarded_at is not null or org.status <> 'active' or org.suspended_at is not null or org.redacted_at is not null then
    raise exception 'draft_unavailable';
  end if;
  select * into draft from public.onboarding_drafts where organization_id=p_org_id for update;
  if not found or draft.revision <> p_expected_revision
    or draft.prepared_version_id is distinct from p_expected_version_id then raise exception 'draft_conflict'; end if;
  if draft.prepared_revision is null then raise exception 'draft_unavailable'; end if;
  if draft.prepared_agent_id is not null then
    select * into agent from public.ai_agents where id=draft.prepared_agent_id and organization_id=p_org_id for update;
    -- Ponteiro externo, agente publicado/padrão/ativo e preparação íntegra não são recuperáveis.
    if not found or agent.is_active or agent.is_default or agent.published_version_id is not null then
      raise exception 'draft_unavailable';
    end if;
    if agent.archived_at is null and draft.prepared_version_id is not null then raise exception 'draft_unavailable'; end if;
    if draft.prepared_version_id is not null then
      perform 1 from public.ai_agent_versions where id=draft.prepared_version_id
        and organization_id=p_org_id and agent_id=agent.id and status='draft' for update;
      if not found then raise exception 'draft_unavailable'; end if;
    end if;
  elsif draft.prepared_version_id is not null then
    raise exception 'draft_unavailable';
  end if;
  update public.onboarding_drafts set prepared_agent_id=null,prepared_version_id=null,
    prepared_revision=null,prepared_request=null,prepared_snapshot=null,rehearsal=null
    where organization_id=p_org_id;
  -- Retira somente o recibo obsoleto desta preparação, nunca outros passos do onboarding.
  if org.onboarding_state #>> '{ai,flow}' = 'reviewed_draft_v2'
    and org.onboarding_state #>> '{ai,version_id}' = draft.prepared_snapshot->>'id' then
    update public.organizations set onboarding_state=onboarding_state-'ai' where id=p_org_id;
  end if;
  insert into public.api_audit_log(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(p_org_id,p_actor_id,'onboarding.preparation_recovered','organization',p_org_id,
      jsonb_build_object('revision',draft.revision,'previous_agent_id',draft.prepared_agent_id,'previous_version_id',draft.prepared_version_id));
  return jsonb_build_object('revision',draft.revision);
end;
$$;
revoke execute on function public.fn_recuperar_preparacao_onboarding(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.fn_recuperar_preparacao_onboarding(uuid,uuid,integer,uuid) to service_role;
notify pgrst, 'reload schema';
