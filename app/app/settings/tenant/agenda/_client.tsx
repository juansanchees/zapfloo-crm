"use client";

import { useT } from "@/hooks/i18n/useT";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { LOCAIS_DE_ATENDIMENTO } from "@/lib/agenda/locais";
import { apiClient } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";

export interface TipoRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  location_kind: string;
  location_details: string | null;
  default_owner_user_id: string | null;
  catalog_product_id: string | null;
  catalog_products: { nome: string; preco_cents: number; moeda: string } | null;
  requires_confirmation: boolean;
  is_active: boolean;
}

/**
 * As dez do CHECK da tabela, com o nome que o dono do negócio usa.
 *
 * ⚠️ O VALOR é o do banco e o RÓTULO é da tela — e os dois não se misturam. A
 * tabela guarda `reuniao` sem acento porque é chave; quem lê vê "Reunião". Se o
 * rótulo virasse valor, o CHECK recusaria e a recusa apareceria como erro
 * interno para quem está usando.
 */
const CATEGORIAS: Array<{ valor: string; rotulo: string }> = [
  { valor: "consulta", rotulo: "Consulta" },
  { valor: "procedimento", rotulo: "Procedimento" },
  { valor: "retorno", rotulo: "Retorno" },
  { valor: "visita", rotulo: "Visita" },
  { valor: "vistoria", rotulo: "Vistoria" },
  { valor: "reuniao", rotulo: "Reunião" },
  { valor: "call", rotulo: "Call" },
  { valor: "orcamento", rotulo: "Orçamento" },
  { valor: "demonstracao", rotulo: "Demonstração" },
  { valor: "outro", rotulo: "Outro" },
];

// Fonte única: a tela que MARCA precisa do mesmo vocabulário, e copiá-lo para lá
// faria uma das duas mostrar o código cru no dia em que um valor entrasse no
// CHECK do banco. Ver o cabeçalho de `lib/agenda/locais.ts`.
const LOCAIS = LOCAIS_DE_ATENDIMENTO;

const rotuloDe = (lista: ReadonlyArray<{ valor: string; rotulo: string }>, valor: string) =>
  lista.find((c) => c.valor === valor)?.rotulo ?? valor;

interface Rascunho {
  name: string;
  category: string;
  duration_minutes: number;
  location_kind: string;
  default_owner_user_id: string;
  catalog_product_id: string;
}

interface ProdutoRow {
  id: string;
  nome: string;
  preco_cents: number;
  moeda: string;
}

const VAZIO: Rascunho = {
  name: "",
  category: "consulta",
  duration_minutes: 30,
  location_kind: "in_person",
  default_owner_user_id: "",
  catalog_product_id: "",
};

function dinheiro(precoCents: number, moeda: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(
    precoCents / 100,
  );
}

export function TiposDeAgendamentoClient({
  tiposIniciais,
  pessoas,
  produtosIniciais,
  perfilAtualSemNome,
  podeEditar,
  usuarioAtualId,
}: {
  tiposIniciais: TipoRow[];
  pessoas: Array<{ id: string; papel: string; nome: string }>;
  produtosIniciais: ProdutoRow[];
  perfilAtualSemNome: boolean;
  podeEditar: boolean;
  usuarioAtualId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [criando, setCriando] = React.useState(false);
  /**
   * O RASCUNHO NASCE COM QUEM ESTÁ CRIANDO.
   *
   * O tipo nascia sem dono por padrão DA PRÓPRIA TELA: `VAZIO` trazia
   * `default_owner_user_id: ""`, o POST omitia o campo, a coluna não tem default
   * no banco — e a lista passava a acusar "sem responsável — não aparece para
   * marcar", um estado que a tela mesma fabricou. Foi assim que "Call
   * Estratégica" nasceu inútil na instalação do dono do produto.
   *
   * A migration 0195 não alcança este caso por construção: o trigger dela é
   * `after insert on user_organizations`, guardado ao PRIMEIRO membro ativo. Ele
   * dispara quando entra MEMBRO, nunca quando entra TIPO — e a org do dono já
   * tinha membro havia tempo.
   *
   * O default vive AQUI e não no POST de propósito: forçar o criador na rota
   * transformaria "Definir depois" num controle decorativo, e deixar um tipo sem
   * dono continua sendo escolha legítima de quem opera.
   */
  const [rascunho, setRascunho] = React.useState<Rascunho>(() => ({
    ...VAZIO,
    default_owner_user_id: usuarioAtualId,
  }));
  const [salvando, setSalvando] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [produtos, setProdutos] = React.useState(produtosIniciais);
  const [criandoProduto, setCriandoProduto] = React.useState(false);
  const [novoProduto, setNovoProduto] = React.useState({ nome: "", preco: "" });

  async function criarProduto(): Promise<void> {
    const preco = Number(novoProduto.preco.replace(",", "."));
    if (!novoProduto.nome.trim() || !Number.isFinite(preco) || preco < 0) {
      toast.error(t("Informe o nome e um preço válido."));
      return;
    }
    setSalvando(true);
    try {
      const codigo = `AGENDA-${randomId().slice(0, 8).toUpperCase()}`;
      const resposta = await apiClient.post<{ data: ProdutoRow }>("/api/v1/products", {
        codigo,
        nome: novoProduto.nome.trim(),
        preco_cents: Math.round(preco * 100),
        controla_estoque: false,
        quantidade: 0,
        ativo: true,
      });
      setProdutos((atuais) => [...atuais, resposta.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setRascunho((r) => ({ ...r, catalog_product_id: resposta.data.id }));
      setNovoProduto({ nome: "", preco: "" });
      setCriandoProduto(false);
      toast.success(t("Produto criado e selecionado."));
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  async function comErro(acao: () => Promise<unknown>, mensagem: string) {
    setSalvando(true);
    try {
      await acao();
      toast.success(mensagem);
      // `refresh` e não estado local: quem sabe o que ficou gravado é o servidor.
      router.refresh();
      return true;
    } catch (err) {
      showApiError(err);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-testid="tipos-de-agendamento-config">
      {perfilAtualSemNome ? (
        <p className="text-sm text-text-muted">
          {t("Seu perfil ainda está sem nome.")} {" "}
          <Link href="/app/settings/profile" className="underline underline-offset-2">
            {t("Abrir Configurações › Perfil")}
          </Link>
        </p>
      ) : null}
      {podeEditar ? (
        <div>
          {criando ? (
            <form
              data-testid="form-novo-tipo"
              className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const feito = await comErro(
                  () =>
                    apiClient.post("/api/v1/agenda/tipos", {
                      name: rascunho.name.trim(),
                      category: rascunho.category,
                      duration_minutes: Number(rascunho.duration_minutes),
                      location_kind: rascunho.location_kind,
                      ...(rascunho.default_owner_user_id
                        ? { default_owner_user_id: rascunho.default_owner_user_id }
                        : {}),
                      catalog_product_id: rascunho.catalog_product_id || null,
                    }),
                  t("Tipo de agendamento criado."),
                );
                if (feito) {
                  setCriando(false);
                  setRascunho(VAZIO);
                }
              }}
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("Nome")}
                <input
                  data-testid="novo-tipo-nome"
                  required
                  minLength={2}
                  value={rascunho.name}
                  onChange={(e) => setRascunho((r) => ({ ...r, name: e.target.value }))}
                  placeholder={t("Retorno")}
                  className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text outline-hidden focus:border-border-strong"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted sm:col-span-2">
                {t("Produto e preço")}
                <select
                  data-testid="novo-tipo-produto"
                  value={rascunho.catalog_product_id}
                  onChange={(e) => setRascunho((r) => ({ ...r, catalog_product_id: e.target.value }))}
                  className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text outline-hidden focus:border-border-strong"
                >
                  <option value="">{t("Sem preço definido")}</option>
                  {produtos.map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {produto.nome} · {dinheiro(produto.preco_cents, produto.moeda)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                {criandoProduto ? (
                  <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_10rem_auto]">
                    <input
                      aria-label={t("Nome do novo produto")}
                      value={novoProduto.nome}
                      onChange={(e) => setNovoProduto((p) => ({ ...p, nome: e.target.value }))}
                      placeholder={t("Nome do produto")}
                      className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text"
                    />
                    <input
                      aria-label={t("Preço do novo produto")}
                      inputMode="decimal"
                      value={novoProduto.preco}
                      onChange={(e) => setNovoProduto((p) => ({ ...p, preco: e.target.value }))}
                      placeholder="0,00"
                      className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text"
                    />
                    <Button type="button" size="sm" disabled={salvando} onClick={() => void criarProduto()}>
                      {t("Criar produto")}
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setCriandoProduto(true)}>
                    {t("Criar um produto com nome e preço")}
                  </Button>
                )}
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("Categoria")}
                <select
                  data-testid="novo-tipo-categoria"
                  value={rascunho.category}
                  onChange={(e) => setRascunho((r) => ({ ...r, category: e.target.value }))}
                  className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text outline-hidden focus:border-border-strong"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {t(c.rotulo)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("Duração (minutos)")}
                <input
                  data-testid="novo-tipo-duracao"
                  type="number"
                  min={5}
                  max={1440}
                  value={rascunho.duration_minutes}
                  onChange={(e) =>
                    setRascunho((r) => ({ ...r, duration_minutes: Number(e.target.value) }))
                  }
                  className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text outline-hidden focus:border-border-strong"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("Onde acontece")}
                <select
                  data-testid="novo-tipo-local"
                  value={rascunho.location_kind}
                  onChange={(e) => setRascunho((r) => ({ ...r, location_kind: e.target.value }))}
                  className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text outline-hidden focus:border-border-strong"
                >
                  {LOCAIS.map((l) => (
                    <option key={l.valor} value={l.valor}>
                      {t(l.rotulo)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted sm:col-span-2">
                {/* ⚠️ SEM RESPONSÁVEL NÃO HÁ AGENDA. `lib/agenda/consulta.ts` exige
                    dono para saber de QUEM é a jornada; sem ele a rota devolve
                    `sem_responsavel` e a tela de marcar não oferece horário nenhum.
                    Era exatamente o estado dos três tipos semeados. */}
                {t("Quem atende (sem isto, não há horário para oferecer)")}
                <select
                  data-testid="novo-tipo-dono"
                  value={rascunho.default_owner_user_id}
                  onChange={(e) =>
                    setRascunho((r) => ({ ...r, default_owner_user_id: e.target.value }))
                  }
                  className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text outline-hidden focus:border-border-strong"
                >
                  <option value="">{t("Definir depois")}</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCriando(false)}>
                  {t("Cancelar")}
                </Button>
                <Button type="submit" size="sm" data-testid="salvar-novo-tipo" disabled={salvando}>
                  {salvando ? t("Criando…") : t("Criar tipo")}
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" data-testid="abrir-novo-tipo" onClick={() => setCriando(true)}>
              {t("Novo tipo de agendamento")}
            </Button>
          )}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2" data-testid="lista-de-tipos">
        {tiposIniciais.length === 0 ? (
          <li data-testid="sem-tipos" className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
            {t("Nenhum tipo de agendamento ainda. Crie o primeiro para que a Agenda tenha o que oferecer.")}
          </li>
        ) : null}
        {tiposIniciais.map((tipo) => (
          <li
            key={tipo.id}
            data-testid={`tipo-${tipo.id}`}
            className={`rounded-lg border border-border bg-surface p-3 ${tipo.is_active ? "" : "opacity-60"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* Sem t(): é o nome que quem opera digitou no campo acima, não
                  rótulo do sistema — traduzir trocaria "Retorno" por
                  "Seguimiento" (chave existente, de outro contexto). */}
              <span className="text-sm font-medium text-text">{tipo.name}</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                {t(rotuloDe(CATEGORIAS, tipo.category))}
              </span>
              <span className="text-xs tabular-nums text-text-muted">{tipo.duration_minutes} min</span>
              <span className="text-xs text-text-muted">{t(rotuloDe(LOCAIS, tipo.location_kind))}</span>
              <span className="text-xs font-medium text-text-muted" data-testid={`preco-${tipo.id}`}>
                {tipo.catalog_products
                  ? `${tipo.catalog_products.nome} · ${dinheiro(tipo.catalog_products.preco_cents, tipo.catalog_products.moeda)}`
                  : t("Sem preço definido")}
              </span>
              {!tipo.default_owner_user_id ? (
                // O aviso existe porque o sintoma é MUDO: sem dono, a tela de
                // marcar simplesmente não mostra horário, sem dizer por quê.
                //
                // E ele É A PORTA quando há como resolver. Antes era um `<span>`
                // inerte: acusava o estado e a única saída era descobrir sozinho
                // que o botão "Editar" abre um seletor de responsável. Acusar sem
                // oferecer caminho é o mesmo defeito do aviso da Agenda que não
                // levava aos horários — dito duas vezes no mesmo produto.
                //
                // Mesmo `data-testid` nos dois ramos: ele é contrato de quem lê a
                // tela, e trocá-lo faria a cerca existente parar de encontrar o
                // aviso sem nada acusar.
                podeEditar ? (
                  <button
                    type="button"
                    data-testid={`sem-dono-${tipo.id}`}
                    onClick={() => setEditandoId(tipo.id)}
                    className="text-xs text-warning underline underline-offset-2"
                  >
                    {t("sem responsável — definir quem atende")}
                  </button>
                ) : (
                  <span data-testid={`sem-dono-${tipo.id}`} className="text-xs text-warning">
                    {t("sem responsável — não aparece para marcar")}
                  </span>
                )
              ) : null}
              {!tipo.is_active ? <span className="text-xs text-text-subtle">{t("desativado")}</span> : null}
              {podeEditar ? (
                <span className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`editar-${tipo.id}`}
                    onClick={() => setEditandoId(editandoId === tipo.id ? null : tipo.id)}
                  >
                    {editandoId === tipo.id ? t("Fechar") : t("Editar")}
                  </Button>
                  {tipo.is_active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`desativar-${tipo.id}`}
                      disabled={salvando}
                      onClick={() =>
                        void comErro(
                          () => apiClient.delete("/api/v1/agenda/tipos", { id: tipo.id }),
                          "Tipo desativado.",
                        )
                      }
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`reativar-${tipo.id}`}
                      disabled={salvando}
                      onClick={() =>
                        void comErro(
                          () => apiClient.patch("/api/v1/agenda/tipos", { id: tipo.id, is_active: true } as never),
                          "Tipo reativado.",
                        )
                      }
                    >
                      Reativar
                    </Button>
                  )}
                </span>
              ) : null}
            </div>

            {editandoId === tipo.id ? (
              <form
                data-testid={`form-editar-${tipo.id}`}
                className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const dados = new FormData(e.currentTarget);
                  const feito = await comErro(
                    () =>
                      apiClient.patch("/api/v1/agenda/tipos", {
                        id: tipo.id,
                        name: String(dados.get("name") ?? "").trim(),
                        category: String(dados.get("category") ?? tipo.category),
                        duration_minutes: Number(dados.get("duration_minutes") ?? tipo.duration_minutes),
                        // `|| null`, e NÃO omitir quando vazio.
                        //
                        // A tela oferece `<option value="">{t("Sem responsável")}</option>`
                        // logo abaixo, e omitir o campo fazia essa escolha não
                        // chegar ao servidor: depois de definido, o responsável não
                        // podia mais ser removido. Controle que a tela oferece e o
                        // código ignora é o pior dos dois — pior que não existir,
                        // porque quem clica conclui que salvou.
                        //
                        // `alterarSchema` aceita `nullish()`, então o nulo é
                        // contrato, não contorno. O efeito de limpar é a agenda
                        // daquele tipo parar de oferecer horário e o aviso amarelo
                        // voltar — que é o laço de retorno correto.
                        default_owner_user_id:
                          String(dados.get("default_owner_user_id") ?? "") || null,
                        catalog_product_id: String(dados.get("catalog_product_id") ?? "") || null,
                      }),
                    "Tipo alterado.",
                  );
                  if (feito) setEditandoId(null);
                }}
              >
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Nome
                  <input
                    name="name"
                    defaultValue={tipo.name}
                    data-testid={`editar-nome-${tipo.id}`}
                    className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  {t("Duração")}
                  <input
                    name="duration_minutes"
                    type="number"
                    min={5}
                    max={1440}
                    defaultValue={tipo.duration_minutes}
                    data-testid={`editar-duracao-${tipo.id}`}
                    className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  {t("Quem atende")}
                  <select
                    name="default_owner_user_id"
                    defaultValue={tipo.default_owner_user_id ?? ""}
                    data-testid={`editar-dono-${tipo.id}`}
                    className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text"
                  >
                    <option value="">{t("Sem responsável")}</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  {t("Produto e preço")}
                  <select
                    name="catalog_product_id"
                    defaultValue={tipo.catalog_product_id ?? ""}
                    data-testid={`editar-produto-${tipo.id}`}
                    className="rounded-md border border-border bg-surface-elevated p-2 text-sm text-text"
                  >
                    <option value="">{t("Sem preço definido")}</option>
                    {produtos.map((produto) => (
                      <option key={produto.id} value={produto.id}>
                        {produto.nome} · {dinheiro(produto.preco_cents, produto.moeda)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end sm:col-span-3">
                  <Button type="submit" size="sm" data-testid={`salvar-${tipo.id}`} disabled={salvando}>
                    {salvando ? t("Salvando…") : t("Salvar")}
                  </Button>
                </div>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
