import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes, rotuloDoAtendente } from "@/lib/users/nome-do-atendente";

import { TiposDeAgendamentoClient, type TipoRow } from "./_client";

export const dynamic = "force-dynamic";

/**
 * TIPOS DE AGENDAMENTO — a configuração que o produto prometia e não tinha.
 *
 * ─── Por que aqui, e não dentro da Agenda ────────────────────────────────
 *
 * O comentário do `lib/navigation/registry.ts` já dizia, antes de esta tela
 * existir: *"Os TIPOS de agendamento e a disponibilidade — que são configuração
 * de verdade — vão para Configurações quando existirem."* A Agenda é onde o dia
 * ACONTECE; aqui é onde ele se configura.
 *
 * ─── O que estava faltando ───────────────────────────────────────────────
 *
 * A `calendar_event_types` tem dez categorias no CHECK, duração, buffers,
 * antecedência mínima, janela de agendamento e local — e não havia como criar ou
 * editar um tipo por lugar nenhum. Toda organização recebia três tipos semeados
 * (`fn_semear_tipos_de_agendamento`) e ficava com eles para sempre; uma clínica
 * que quisesse "Retorno de 15 minutos" não tinha caminho.
 */
export default async function TiposDeAgendamentoPage() {
  const user = await requireAuth();
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma` (a cadeia pessoa → organização →
  // padrão vive em `lib/auth/server.ts`).
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // `viewer` vê a lista (é informação de operação: quanto dura uma consulta);
  // criar e alterar é `manager`, e a rota cobra de novo — a tela esconder não é
  // autorização, é cortesia.
  const podeEditar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const [{ data: tipos }, { data: pessoas }, { data: produtos }] = await Promise.all([
    supabase
      .from("calendar_event_types")
      .select(
        "id, name, slug, description, category, duration_minutes, location_kind, location_details, default_owner_user_id, catalog_product_id, requires_confirmation, is_active, catalog_products!calendar_event_types_catalog_product_org_fkey(nome, preco_cents, moeda)",
      )
      .eq("organization_id", activeOrg.orgId)
      .order("is_active", { ascending: false })
      .order("name"),
    supabase
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", activeOrg.orgId)
      .is("revoked_at", null),
    supabase
      .from("catalog_products")
      .select("id, nome, preco_cents, moeda, ativo")
      .eq("organization_id", activeOrg.orgId)
      .eq("ativo", true)
      .order("nome"),
  ]);

  // O NOME DE GENTE, e não o fragmento de UUID.
  //
  // O seletor de "quem atende" oferecia `0c4f9a1e · admin` — a página lia só
  // `user_id, role` e nunca resolvia nome. Escolher responsável entre pedaços de
  // identificador não é escolha: é adivinhação, e o dono do produto tinha de
  // acertar qual dos fragmentos era ele.
  //
  // `nomesDosAtendentes` expõe SÓ `full_name`, de propósito. Não trocar por
  // `/api/v1/team`, que devolve e-mail e último acesso — PII a mais numa tela de
  // configuração que não precisa dela.
  //
  // Numa VPS sem `SUPABASE_SERVICE_ROLE_KEY` ele devolve Map vazio por decisão
  // declarada. O fallback continua legível ("Sem nome — papel"), nunca volta a
  // expor um pedaço de UUID. Para a própria conta, `requireAuth()` já traz o
  // nome validado da sessão e é a fonte do aviso de Perfil.
  const nomes = await nomesDosAtendentes((pessoas ?? []).map((p) => String(p.user_id)));
  const tiposParaTela: TipoRow[] = (tipos ?? []).map((tipo) => {
    const produto = Array.isArray(tipo.catalog_products)
      ? (tipo.catalog_products[0] ?? null)
      : tipo.catalog_products;
    return {
      id: String(tipo.id),
      name: String(tipo.name),
      slug: String(tipo.slug),
      description: tipo.description === null ? null : String(tipo.description),
      category: String(tipo.category),
      duration_minutes: Number(tipo.duration_minutes),
      location_kind: String(tipo.location_kind),
      location_details: tipo.location_details === null ? null : String(tipo.location_details),
      default_owner_user_id:
        tipo.default_owner_user_id === null ? null : String(tipo.default_owner_user_id),
      catalog_product_id:
        tipo.catalog_product_id === null ? null : String(tipo.catalog_product_id),
      catalog_products: produto
        ? {
            nome: String(produto.nome),
            preco_cents: Number(produto.preco_cents),
            moeda: String(produto.moeda),
          }
        : null,
      requires_confirmation: Boolean(tipo.requires_confirmation),
      is_active: Boolean(tipo.is_active),
    };
  });

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Tipos de agendamento")}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {t("O que se pode marcar, quanto dura e quem atende. É isto que a tela de marcar e o agente de IA oferecem ao cliente.")}
        </p>
      </header>
      <TiposDeAgendamentoClient
        tiposIniciais={tiposParaTela}
        pessoas={(pessoas ?? []).map((p) => ({
          id: String(p.user_id),
          papel: String(p.role),
          nome: rotuloDoAtendente({
            userId: String(p.user_id),
            usuarioAtualId: user.id,
            fullName: nomes.get(String(p.user_id)),
            role: String(p.role),
            t,
          }),
        }))}
        usuarioAtualId={user.id}
        perfilAtualSemNome={!user.full_name?.trim()}
        produtosIniciais={(produtos ?? []).map((produto) => ({
          id: String(produto.id),
          nome: String(produto.nome),
          preco_cents: Number(produto.preco_cents),
          moeda: String(produto.moeda),
        }))}
        podeEditar={podeEditar}
      />
    </div>
  );
}
