/**
 * Gestão de funis pela tela do Kanban — a jornada de quem organiza o próprio CRM.
 *
 * Cobre a feature inteira num só fio, porque é assim que ela é usada: a lista
 * respeita a organização ativa, o funil nasce com colunas, é renomeado,
 * reordenado, vira padrão, e as duas recusas que protegem a operação aparecem
 * explicadas na tela (arquivar o padrão, arquivar o último).
 *
 * ⚠️ O PRIMEIRO CASO SÓ TEM PODER COM DUAS ORGANIZAÇÕES. `seed-e2e-funis.ts`
 * coloca o manager numa segunda org que também tem um funil "Pedidos" (o gatilho
 * de seed cria um em toda org nova). Com uma org só, o caso passaria mesmo com o
 * filtro de `organization_id` apagado da página — mediria o seed, não o código.
 *
 * O teste devolve o estado como encontrou (o funil criado termina arquivado, e o
 * padrão volta para onde estava), então roda quantas vezes for preciso.
 *
 * Pré-requisito: seed de credenciais + seed de funis (rodados aqui se faltarem).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), ".superpowers", "evidence");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
  funis?: { segunda_org_id: string };
}

function loadCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  let c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  if (!c.users?.manager) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  if (!c.funis?.segunda_org_id) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-funis.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  return c;
}

const creds = loadCreds();

/**
 * O prefixo é constante para a VARREDURA poder reconhecer o que este spec cria.
 * Trocar o texto aqui e esquecer o padrão abaixo faria a limpeza parar de achar
 * o próprio lixo — em silêncio, que é como este defeito nasceu.
 */
const PREFIXO = "Clinica E2E ";
const NOME = `${PREFIXO}${Date.now()}`;
const RENOMEADO = `${NOME} renomeado`;

/** `Clinica E2E 1757529600000` e `… renomeado` — só o que este spec cria. */
const PADRAO_DE_TESTE = /^Clinica E2E \d+( renomeado)?$/;

/**
 * Arquiva os funis que ESTE spec deixou para trás em execuções anteriores.
 *
 * ⚠️ POR QUE ISTO EXISTE. O spec cria `Clinica E2E <timestamp>` a cada rodada e
 * só arquivava no caminho feliz — no fim do caso. Enquanto o caso falhou (e ele
 * falhou por semanas, antes na reordenação), a linha de arquivar NUNCA era
 * alcançada, e cada rodada deixava mais um funil ativo na organização.
 *
 * O estrago não foi só sujeira: o último passo do caso afirma "não dá para
 * arquivar o ÚLTIMO funil", e com o entulho o «Pedidos» deixou de ser o último.
 * O produto então recusava com a razão CERTA e OUTRA — "é o funil padrão"
 * (`validarArquivamento` confere «único» ANTES de «padrão», em
 * lib/pipelines/pipeline-editing.ts) —, e o teste lia isso como defeito. Ou
 * seja: o teste sujava o ambiente e depois falhava por causa da própria sujeira.
 *
 * A varredura é DELIBERADAMENTE estreita: só nomes que casam com PADRAO_DE_TESTE
 * e só ARQUIVA (o DELETE sem `?definitivo=1` marca `is_archived`, não apaga).
 * Nenhum funil de verdade tem esse formato de nome.
 */
async function varrerFunisDeTeste(page: Page, exceto: string[] = []): Promise<void> {
  try {
    const resposta = await page.request.get("/api/v1/pipelines");
    if (!resposta.ok()) return;
    const corpo = (await resposta.json()) as {
      data?: Array<{ id: string; name: string; is_archived?: boolean }>;
    };
    const orfaos = (corpo.data ?? []).filter(
      (f) => !f.is_archived && PADRAO_DE_TESTE.test(f.name) && !exceto.includes(f.name),
    );
    for (const f of orfaos) {
      await page.request.delete(`/api/v1/pipelines/${f.id}`);
    }
  } catch {
    // A LIMPEZA NUNCA DERRUBA O TESTE, e a razão é a mesma que fez duas falhas
    // ficarem indeterminadas neste repo: exceção lançada num teardown SUBSTITUI
    // a exceção real que estava em voo, e o relatório passa a mostrar o erro da
    // faxina em vez do erro do produto. Falhar em limpar é ruído; apagar o
    // diagnóstico é perder a rodada inteira.
  }
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/);
}

/** A linha do funil pelo nome visível — a lista não expõe id para o usuário. */
function linhaDoFunil(page: Page, nome: string) {
  return page.locator('li[data-testid^="funil-"]').filter({ hasText: nome });
}

/**
 * O id do funil, lido da própria linha.
 *
 * ⚠️ SEM ISTO O SPEC PEGA O BOTÃO ERRADO. "Arquivar" aparece três vezes na tela
 * com o painel de confirmação aberto (o botão de cada linha e o de confirmar), e
 * casar por TEXTO resolve para vários elementos. Com o id, cada clique aponta
 * para um alvo só — que é o que o teste quer dizer quando diz "clique aqui".
 */
async function idDoFunil(page: Page, nome: string): Promise<string> {
  const testid = await linhaDoFunil(page, nome).getAttribute("data-testid");
  if (!testid) throw new Error(`funil «${nome}» não está na lista`);
  return testid.replace(/^funil-/, "");
}

test.describe("gestão de funis", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, creds.users.manager!.email);
    // Varre ANTES de abrir a tela: o entulho de rodadas passadas some da lista
    // que o caso vai medir. Sem isto, "o último funil" nunca volta a ser o
    // último, e o caso mede o histórico do CI em vez do produto.
    await varrerFunisDeTeste(page);
    await page.goto("/app/kanban");
    await expect(page.getByRole("heading", { name: "Funis" })).toBeVisible();
  });

  // E varre DEPOIS, para o que este caso criou não virar o entulho do próximo —
  // inclusive (e principalmente) quando ele falha no meio, que é exatamente
  // quando o caminho feliz de arquivar não é alcançado.
  test.afterEach(async ({ page }) => {
    await varrerFunisDeTeste(page);
  });

  test("a lista mostra só a organização ativa, mesmo com funil homônimo em outra", async ({
    page,
  }) => {
    // O manager é membro de DUAS organizações, e as duas têm um funil "Pedidos".
    // Sem o filtro por organização, apareceriam as duas linhas — indistinguíveis,
    // cada uma levando a um quadro diferente.
    await expect(page.getByText("Pedidos", { exact: true })).toHaveCount(1);
  });

  test("cria funil com colunas, edita, e as recusas aparecem explicadas", async ({ page }) => {
    // ---- criar ----
    await page.getByTestId("novo-funil").click();
    await page.getByTestId("nome-do-novo-funil").fill(NOME);
    await page.getByTestId("confirmar-novo-funil").click();
    await expect(linhaDoFunil(page, NOME)).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "funis-01-criado.png"), fullPage: true });

    // ---- o funil nasce com as quatro colunas (senão o quadro é morto) ----
    await linhaDoFunil(page, NOME).getByRole("link").click();
    await page.waitForURL(/\/app\/pipelines\//);
    for (const coluna of ["Novo", "Em andamento", "Ganho", "Perdido"]) {
      await expect(page.getByText(coluna, { exact: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: path.join(EVIDENCIA, "funis-02-quadro-novo.png"), fullPage: true });

    await page.goto("/app/kanban");

    // ---- renomear ----
    const id = await idDoFunil(page, NOME);
    await page.getByTestId(`renomear-${id}`).click();
    await page.getByTestId(`nome-${id}`).fill(RENOMEADO);
    await page.getByTestId(`salvar-nome-${id}`).click();
    await expect(linhaDoFunil(page, RENOMEADO)).toBeVisible();

    // ---- reordenar: sobe UMA posição ----
    //
    // ⚠️ Esta asserção exigia que UM clique levasse ao TOPO, e isso só valeria
    // com o funil na segunda linha. O botão não promete isso: `subir` troca com
    // o VIZINHO de cima (`vizinhoAoMover(funis, i, "subir")`, em
    // app/app/kanban/_client.tsx:240) e nasce `disabled` quando `i === 0`. Como
    // o funil criado aqui entra no FIM da lista
    // (`posicaoEntre(funis[funis.length - 1]?.position ?? null, null)`, em
    // app/api/v1/pipelines/route.ts:116) e a organização já tem outros, um
    // clique move uma casa e o topo segue sendo outro.
    //
    // Medir o DESLOCAMENTO é o que o botão realmente promete — e, ao contrário
    // do "é o primeiro", não passa por acaso quando a lista tem tamanho 2.
    const linhas = page.locator('li[data-testid^="funil-"]');
    const posicaoDoFunil = async (): Promise<number> => {
      const ids = await linhas.evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid") ?? ""),
      );
      return ids.indexOf(`funil-${id}`);
    };

    const antes = await posicaoDoFunil();
    expect(antes, "o funil recém-criado precisa aparecer na lista").toBeGreaterThan(0);

    await page.getByTestId(`subir-${id}`).click();
    await expect
      .poll(posicaoDoFunil, { timeout: 15_000 })
      .toBe(antes - 1);
    await expect(linhaDoFunil(page, RENOMEADO)).toBeVisible();

    // ---- tornar padrão ----
    await page.getByTestId(`padrao-${id}`).click();
    await expect(linhaDoFunil(page, RENOMEADO).getByText("Padrão")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "funis-03-padrao.png"), fullPage: true });

    // ---- recusa: arquivar o funil padrão ----
    await page.getByTestId(`arquivar-${id}`).click();
    await page.getByTestId(`arquivar-confirmar-${id}`).click();
    await expect(page.getByTestId(`arquivar-erro-${id}`)).toContainText(/padrão/i);
    await page.screenshot({
      path: path.join(EVIDENCIA, "funis-04-recusa-padrao.png"),
      fullPage: true,
    });

    // ---- devolve o padrão e arquiva de verdade ----
    const idPedidos = await idDoFunil(page, "Pedidos");
    await page.getByTestId(`padrao-${idPedidos}`).click();
    await expect(linhaDoFunil(page, "Pedidos").getByText("Padrão")).toBeVisible();

    await page.getByTestId(`arquivar-${id}`).click();
    await page.getByTestId(`arquivar-confirmar-${id}`).click();
    await expect(linhaDoFunil(page, RENOMEADO)).toHaveCount(0);

    // ---- recusa: arquivar o último funil ----
    //
    // A PRECONDIÇÃO É MEDIDA, e não suposta. Este caso só existe se «Pedidos»
    // for mesmo o único ativo: `validarArquivamento` confere «único» ANTES de
    // «padrão» (lib/pipelines/pipeline-editing.ts), então com qualquer outro
    // funil vivo a recusa vem com a outra razão — certa, porém outra — e o
    // vermelho acusaria o produto quando a causa é o AMBIENTE. Foi exatamente
    // isso que aconteceu enquanto o spec não limpava o que criava.
    await expect(
      page.locator('li[data-testid^="funil-"]'),
      "o caso do «último funil» exige que só «Pedidos» tenha sobrado — há funil de outra origem na organização",
    ).toHaveCount(1);

    await page.getByTestId(`arquivar-${idPedidos}`).click();
    await page.getByTestId(`arquivar-confirmar-${idPedidos}`).click();
    await expect(page.getByTestId(`arquivar-erro-${idPedidos}`)).toContainText(/único/i);
    await page.screenshot({
      path: path.join(EVIDENCIA, "funis-05-recusa-ultimo.png"),
      fullPage: true,
    });
  });

});

/**
 * Fora do `describe` acima de propósito: este caso entra com OUTRO usuário, e o
 * `beforeEach` de lá já teria logado como manager — a sessão do manager mascararia
 * exatamente o que se quer medir.
 */
test("quem não pode gerenciar vê a lista sem os controles de escrita", async ({ page }) => {
  // Botão que o servidor recusaria é promessa que não se cumpre: `requireRole`
  // cobra manager nas rotas, então agent não vê "Novo funil" nem "Arquivar".
  await login(page, creds.users.agent!.email);
  await page.goto("/app/kanban");
  await expect(page.getByRole("heading", { name: "Funis" })).toBeVisible();
  await expect(page.getByText("Pedidos", { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("novo-funil")).toHaveCount(0);
  await expect(page.locator('[data-testid^="arquivar-"]')).toHaveCount(0);
});
