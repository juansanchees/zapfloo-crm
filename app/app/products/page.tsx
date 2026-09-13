import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ORIGEM_SITE } from "@/lib/catalogo/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_PRODUTO, type Produto } from "@/lib/schemas/produtos";
import { createClient } from "@/lib/supabase/server";

import { ProdutosClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * O CATÁLOGO DA LOJA — onde o preço que a IA responde é cadastrado.
 *
 * ─── Por que esta tela precisa existir ───────────────────────────────────
 *
 * A ferramenta `crm_search_products` já vinha ligada em todo agente novo, e
 * lia uma tabela que ninguém nunca preencheu. O efeito não era silêncio: era o
 * agente respondendo "não tenho nada com esse nome no catálogo" para uma loja
 * com o estoque cheio. Ferramenta que devolve vazio para 100% das lojas é pior
 * que ferramenta ausente — ela mente com autoridade.
 *
 * ─── Quem pode o quê ─────────────────────────────────────────────────────
 *
 * `viewer` VÊ o catálogo: saber quanto custa é informação de operação, e quem
 * atende precisa dela. Cadastrar e alterar preço é `manager`, e a rota cobra de
 * novo — a tela esconder o botão é cortesia, não autorização.
 */
export default async function ProdutosPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeEditar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const [catalogo, rascunhos] = await Promise.all([supabase
    .from("catalog_products")
    .select(COLUNAS_DO_PRODUTO)
    .eq("organization_id", activeOrg.orgId)
    .order("ativo", { ascending: false })
    .order("nome")
    .limit(500), supabase
    .from("catalog_products")
    .select(COLUNAS_DO_PRODUTO)
    .eq("organization_id", activeOrg.orgId)
    .eq("origem", ORIGEM_SITE)
    .eq("ativo", false)
    .order("nome")
    .limit(500),
  ]);
  // O limite da listagem normal não pode esconder rascunhos depois de 500
  // produtos ativos: são justamente eles que a pessoa veio conferir.
  const linhas = [...(rascunhos.data ?? []), ...(catalogo.data ?? [])] as unknown as Produto[];
  const inicial = Array.from(new Map(linhas.map((produto) => [produto.id, produto])).values());

  return (
    <ProdutosClient
      inicial={inicial}
      podeEditar={podeEditar}
      textos={{
        titulo: t("Produtos"),
        subtitulo: t(
          "O catálogo da loja. É daqui que o atendente de IA tira o preço quando alguém pergunta.",
        ),
        vazio: t("Nenhum produto cadastrado ainda"),
        vazioDica: t(
          "Enquanto o catálogo estiver vazio, o atendente responde que não encontrou o produto — mesmo que a loja tenha.",
        ),
      }}
    />
  );
}
