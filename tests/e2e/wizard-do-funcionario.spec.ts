/**
 * O WIZARD, PELA TELA, DENTRO DO CI.
 *
 * A jornada de instalação fresca é a P0 da doutrina de QA deste projeto — é o
 * produto que se vende — e é a ÚNICA spec fora do gate, porque depende de WAHA,
 * Redis, Resend e Nuvemshop. O resultado é que o onboarding pôde apodrecer sem
 * nada ficar vermelho: foi assim que oito premissas mortas chegaram até aqui.
 *
 * ⚠️ ESTA SPEC COBRE OS QUATRO PRIMEIROS PASSOS, NÃO O WIZARD INTEIRO.
 *
 * Este cabeçalho afirmava "o wizard inteiro, do login ao 'Começar a usar'", e
 * isso era falso havia muito tempo — a afirmação sobreviveu ao mundo que
 * descrevia, que é o defeito nº 16 do DoD deste repo. Os casos da segunda
 * metade esperavam `/onboarding/funil` logo após o login, e `passos.ts` declara
 * SEIS passos não-condicionais entre um e outro. Eles não reprovavam porque
 * `mode: "serial"` os mantinha em "did not run" atrás de uma falha anterior.
 *
 * O que fica coberto aqui: a tela abre com o que a instalação trouxe, os termos
 * levam a documentos que existem, o nome do negócio chega ao cabeçalho seguinte,
 * e o passo de treinar oferece caminho para a chave em vez de virar beco.
 *
 * O que NÃO fica: montar o quadro, o modelo pronto, a validação de coluna, a
 * memória da organização e o fecho do wizard. Essa metade volta com
 * `codex/jornada-p0`, que reescreve este arquivo e reordena os passos.
 *
 * Para saber o que ESTE arquivo mede sem confiar neste texto:
 *   grep -c '^  test(' tests/e2e/wizard-do-funcionario.spec.ts
 *
 * ISOLAMENTO: cria a PRÓPRIA organização, com o próprio dono. O seed do CI
 * entrega a organização compartilhada já onboardada, e zerar o estado dela para
 * testar o wizard mandaria todas as specs seguintes para dentro do onboarding.
 */
import { randomUUID } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SENHA = "WizardQa!2026#Deskcomm";
const email = `wizard-${randomUUID().slice(0, 8)}@qa.local`;

let userId = "";
let orgId = "";

/**
 * O estado que o `install.sh` deixa: dono criado, organização com o nome
 * placeholder, provedor de IA escolhido no terminal, e `onboarded_at` nulo.
 */
test.beforeAll(async () => {
  const { data: criado, error: errUser } = await svc.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  });
  if (errUser || !criado.user) throw errUser ?? new Error("sem usuário");
  userId = criado.user.id;

  const { data: org, error: errOrg } = await svc
    .from("organizations")
    .insert({
      slug: `minha-empresa-${randomUUID().slice(0, 8)}`,
      display_name: "Minha Empresa",
      legal_name: "Minha Empresa",
      status: "active",
      created_by: userId,
      settings: { llm: { provider: "anthropic" } },
    })
    .select("id")
    .single();
  if (errOrg || !org) throw errOrg ?? new Error("sem org");
  orgId = org.id as string;

  await svc.from("user_organizations").insert({
    organization_id: orgId,
    user_id: userId,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  if (orgId) {
    await svc.from("ai_agent_runs").delete().eq("organization_id", orgId);
    await svc.from("ai_agent_versions").delete().eq("organization_id", orgId);
    await svc.from("ai_agents").delete().eq("organization_id", orgId);
    await svc.from("org_memory_pointers").delete().eq("organization_id", orgId);
    await svc.from("org_memory_versions").delete().eq("organization_id", orgId);
    await svc.from("crm_stages").delete().eq("organization_id", orgId);
    await svc.from("crm_pipelines").delete().eq("organization_id", orgId);
    await svc.from("user_organizations").delete().eq("organization_id", orgId);
  }
  if (userId) await svc.auth.admin.deleteUser(userId);
});

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("o wizard monta um funcionário", () => {
  test("abre mostrando o que a instalação já trouxe, e não pede o nome de novo", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 30_000 });

    // O passo 1 começa pelo que já existe — em vez de um formulário em branco.
    await expect(page.getByText(/já está de pé/i)).toBeVisible();

    // O instalador nunca pergunta o nome do negócio: a organização nasce
    // "Minha Empresa". Mandar isso como valor inicial obrigava a pessoa a
    // apagá-lo, e quem não percebia ficava com o placeholder para sempre.
    await expect(page.locator("#display_name")).toHaveValue("");
  });

  test("o aceite de termos leva a documentos que EXISTEM", async ({ page }) => {
    // O checkbox é obrigatório e linkava duas páginas que respondiam 404.
    for (const href of ["/legal/terms", "/legal/privacy"]) {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
    }
  });

  test("o nome do negócio chega ao cabeçalho do passo seguinte", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 30_000 });

    await page.locator("#display_name").fill("Clínica Bem Viver");
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /^continuar$/i }).click();
    // Nesta branch PASSOS põe Treinar após welcome. jornada-p0 muda essa
    // ordem; não importar sua decisão de produto junto do locator abaixo.
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });

    // A identidade persistente agora mora no aside do wizard; o header contém
    // marca e controles. Medir o h1 evita um falso positivo no body genérico.
    const identidade = page.locator("aside").getByRole("heading", { level: 1 });
    await expect(identidade).toHaveText("Clínica Bem Viver");
    await expect(identidade).not.toHaveText("Minha Empresa");
  });

  // ═══ OS DOIS CASOS DO PASSO DO TELEFONE VIVEM EM `codex/jornada-p0` ═══
  //
  // Estavam aqui:
  //   "o passo do telefone pergunta COMO se conecta antes de assumir o código"
  //   "o passo do telefone não expõe identificador interno nem enum"
  //
  // Os dois começam com `login()` seguido de
  // `waitForURL(/\/onboarding\/connect-whatsapp/)` — isto é, assumem que o passo
  // do TELEFONE vem logo depois do welcome. Nesta branch ele não vem, e não é
  // acidente: `lib/onboarding/passos.ts` ordena welcome → setup-ai →
  // connect-whatsapp, e `app/onboarding/connect-whatsapp/page.tsx:24` FECHA a
  // porta com `if (!state.ai) redirect("/onboarding/setup-ai")`. Ir direto pela
  // URL também não alcança: o redirect é do servidor.
  //
  // Derrubar essa trava — deixar conectar o número SEM configurar IA antes — é
  // precisamente a feature de `codex/jornada-p0`, que remove aquele redirect e
  // reordena os passos. É lá que estes dois casos medem alguma coisa, e é lá que
  // eles JÁ ESTÃO, com o mesmo título e o mesmo corpo. Nada se perdeu aqui: eles
  // voltam junto com a branch que os torna verdadeiros.
  //
  // ⚠️ E eles NUNCA passaram nesta branch. Não é regressão nova: a spec é
  // `mode: "serial"`, o caso anterior ("o nome do negócio chega ao cabeçalho do
  // passo seguinte") falhava antes deles, e a cascata os deixava em "did not
  // run" — invisíveis. Quando aquele foi consertado (63fb5a483), estes
  // apareceram. Consertar um revela o próximo; é o comportamento esperado de uma
  // suíte serial, não um efeito colateral do conserto.

  test("treinar não é um beco: a chave de IA tem caminho na própria tela", async ({ page }) => {
    // ⚠️ ESTE CASO MEDIA UM CARD QUE SAIU DA TELA — de propósito.
    //
    // Ele cobrava `/cérebro/i`, `#api_key_da_ia`, `#provedor_da_ia`, "guardar a
    // chave" e "guardada cifrada". Tudo isso é de `InteligenciaDele`
    // (app/onboarding/setup-ai/_inteligencia.tsx), que
    // app/onboarding/setup-ai/page.tsx DEIXOU DE RENDERIZAR — o comentário de lá
    // diz o porquê com todas as letras: "não diagnosticar o default da
    // organização nem disparar a prova automática do card legado". No lugar
    // ficou um caminho explícito, `configurarChaveDoOnboarding`.
    //
    // O componente ainda existe no repositório, então `grep` por "cérebro"
    // encontra e engana: ele não chega mais a ESTA tela. E "guardada cifrada"
    // hoje só vive em app/admin/(protected)/google/_form.tsx, que é outra tela
    // inteira — a asserção mirava em nada.
    //
    // O QUE NÃO MUDOU é o que este caso sempre quis guardar, e que segue valendo:
    // a tela nunca deixa a pessoa sabendo que falta a chave sem dizer o que
    // fazer. Antes o passo escrevia "Falta a chave da inteligência artificial" e
    // o assunto morria ali — diagnóstico certo, saída nenhuma. Então a asserção
    // passa a ser a SAÍDA, que é o invariante "nenhuma demanda sem próximo
    // passo" da doutrina do Sistema Vivo. Medir o texto do card velho era medir
    // a implementação; medir a saída é medir a promessa.
    await login(page);
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: /treine seu funcionário/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /configurar chave de ia/i }),
      "o passo exige chave de IA e precisa dizer ONDE se consegue uma",
    ).toBeVisible();
  });

  test("treinar mostra o que ele já sabe fazer e o que sempre confere", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: /treine seu funcionário/i })).toBeVisible();
    // As duas listas que não pedem configuração nenhuma. É o que a tela entrega
    // ANTES de qualquer chave — e é o que a pessoa lê para entender o que
    // contratou, na única tela do wizard que explica o produto.
    await expect(page.getByText(/ele já vem sabendo/i)).toBeVisible();
    await expect(page.getByText(/o que ele sempre confere antes de enviar/i)).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // O RESTO DA JORNADA SAIU DAQUI — E NUNCA RODOU NESTA BRANCH
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Havia aqui seis casos que seguiam a jornada até o fim: montar o quadro,
  // trocar por um modelo pronto, barrar coluna sem nome, ensinar o destino de
  // cada coluna, provar que as regras da casa viraram memória da organização, e
  // fechar o wizard. Todos começavam com
  // `login()` + `waitForURL(/\/onboarding\/funil/)`.
  //
  // ISSO É ESTRUTURALMENTE IMPOSSÍVEL AQUI, e não é regressão recente.
  //
  // `lib/onboarding/passos.ts` declara SEIS passos nesta branch, e nenhum é
  // condicional — cada um só é dado por cumprido pelo seu próprio marcador:
  //
  //     welcome → setup-ai → connect-whatsapp → connect-nuvemshop → funil → invite-team
  //
  // E este arquivo não trata `connect-whatsapp` nem `connect-nuvemshop` em
  // lugar nenhum. Sem alguém cumprir esses dois passos, `proximoPasso` nunca
  // devolve `funil`, e o `waitForURL` dos seis casos expirava — sempre.
  //
  // Eles não reprovavam porque nunca chegavam a rodar: o `describe` é
  // `mode: "serial"`, um caso anterior falhava primeiro, e a cascata os deixava
  // em "did not run" — que no relatório lê igual a "tudo bem". Ficaram assim
  // por semanas. A rodada de 10/09/2026 consertou os casos da frente, a fila
  // andou, e eles apareceram um por um.
  //
  // DOIS SINAIS DE QUE A TELA MUDOU E ELES NÃO ACOMPANHARAM. Os botões que o
  // primeiro deles clicava — "Criar e continuar" e "Continuar sem publicar" —
  // não existem em componente nenhum: sobrevivem SÓ como chave órfã em
  // `lib/i18n/dicionario.ts` (linhas 4675 e 4653). O formulário de hoje
  // (`app/onboarding/setup-ai/_form.tsx`) tem um botão: "Salvar rascunho"; quem
  // avança é "Continuar para conexão", em `_ensaio.tsx`.
  //
  // POR QUE REMOVER EM VEZ DE REESCREVER. `codex/jornada-p0` reescreve este
  // mesmo arquivo (349 linhas contra 425) E REORDENA os passos — pôr o telefone
  // antes da IA é a feature dela. Reescrever os seis para a ordem de hoje
  // produziria trabalho que a própria jornada-p0 descarta no merge seguinte, e
  // criaria conflito no rebase.
  //
  // ⚠️ O QUE ISSO CUSTA, DITO SEM MAQUIAGEM: a jornada completa do wizard fica
  // sem prova automatizada nesta branch. Ela NÃO estava provada antes — estes
  // casos não rodavam —, então nada de real foi perdido aqui. Mas também não
  // ganhamos: continua valendo, e some com esta remoção, a mesma ressalva que
  // `FORA_DO_CI` já declara sobre `vps-fresh-onboarding` — **`e2e` verde não
  // prova a jornada de instalação fresca**, que é o produto que se vende.
  //
  // A cobertura volta com `codex/jornada-p0`, na ordem que ela estabelece.
  //
  // O QUE CONTINUA VIGIADO AQUI: os quatro primeiros passos da primeira
  // impressão — a tela abre com o que a instalação trouxe, os termos levam a
  // documentos que existem, o nome do negócio chega ao cabeçalho seguinte, o
  // passo de treinar oferece caminho para a chave em vez de virar beco, e as
  // duas listas que explicam o agente aparecem.

});
