/**
 * TODA SPEC DE E2E OU RODA NO CI, OU ESTÁ DECLARADA COMO FORA — NUNCA SUMIDA.
 *
 * ## O defeito, medido em 2026-08-08
 *
 * `.github/workflows/e2e.yml` tinha as listas de spec digitadas dentro dos dois
 * `run:` e, mais abaixo, um passo cuja função declarada era dizer o que o job NÃO
 * cobre — escrito à mão, em prosa. As duas fontes divergiram em silêncio:
 *
 *   no disco: 39 arquivos · nas listas: 36 · o texto afirmava "32 de 33"
 *
 * As três ausentes eram justamente as novas, e uma delas era
 * `agente-papeis-operador.spec.ts` — a prova de tela do épico dos três papéis do
 * agente, apresentada no handoff daquele épico como "7/7", que **nunca rodou em
 * job nenhum**. O número era afirmação do autor, não medição do CI.
 *
 * O modo de falha é o que dói: **cobertura parcial silenciosa se lê como cobertura
 * total.** Quem olha o job verde conclui que a suíte está verde. E o passo que
 * existia para desfazer essa leitura estava, ele mesmo, desatualizado.
 *
 * ## Por que estático, e por que aqui
 *
 * A propriedade é enumerável a partir do repositório — arquivos no disco × nomes
 * nas listas — e é exatamente onde a régua do repo diz que o teste ganha do hábito
 * (`navegacao-completude`, que achou duas telas órfãs que três varreduras manuais
 * não acharam). Descobrir isto dinamicamente custaria um job de CI inteiro, que é
 * o custo que se está tentando não pagar de novo.
 *
 * Vive em `tests/unit/` de propósito: `pnpm test:unit` roda no check `verify`, que
 * é OBRIGATÓRIO na branch protection. Em `tests/invariants/` dependeria de Postgres
 * e de um check que não bloqueia merge.
 *
 * ## O que se guarda — três propriedades, três modos de falha
 *
 * 1. **Completude** (disco → listas): spec nova que ninguém pôs em lista nenhuma.
 * 2. **Vigência** (listas → disco): spec renomeada ou apagada que ficou na lista;
 *    o Playwright aceita um filtro que não casa nada e o job segue VERDE.
 * 3. **Consumo**: a lista é de fato passada ao Playwright. Sem isto, alguém
 *    acrescenta o nome à variável, o gate fica verde, e a spec continua sem rodar
 *    — a mesma cobertura fantasma, com uma camada a mais de aparência.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const WORKFLOW = path.join(RAIZ, ".github", "workflows", "e2e.yml");
const DIR_SPECS = path.join(RAIZ, "tests", "e2e");

/**
 * Lê uma variável de bloco YAML (`CHAVE: >-`) e devolve os nomes.
 *
 * Parser deliberadamente estreito: casa só a forma que o arquivo usa. Um parser
 * de YAML de verdade aceitaria formas que ninguém escreveu e esconderia uma
 * reescrita do bloco — aqui, se a forma mudar, o controle positivo abaixo estoura
 * em vez de devolver lista vazia.
 */
function listaDoWorkflow(yml: string, chave: string): string[] {
  const re = new RegExp(`^\\s*${chave}:\\s*>-\\s*\\n((?:\\s{8,}\\S.*\\n)+)`, "m");
  const m = re.exec(yml);
  if (m === null) return [];
  return m[1]!
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".spec.ts"));
}

const SPEC_LEITOR_SITE = "onboarding-leitor-de-site.spec.ts";
const SPEC_META_ADS = "meta-ads-oauth.spec.ts";
const PREPARAR_CIFRA_META = 'psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f tests/e2e/helpers/meta-ads-cifra.sql';

/**
 * Esta spec sai de LISTA porque precisa de dois receivers e preloads próprios.
 * Estar citada em SPECS_PARTE_2, portanto, já não prova que ela será executada.
 * Recorta PASSOS YAML pela indentação; comentários e prosa não são comandos.
 * O parser é estreito como o das listas: uma mudança de forma exige rever a
 * prova, em vez de aceitar um comentário como se fosse uma execução.
 */
function passosDoWorkflow(workflow: string): string[] {
  return [...workflow.matchAll(/^ {6}- [^\n]*(?:\n(?! {6}- | {2}\S)[^\n]*)*/gm)]
    .map((m) => m[0]);
}

function executaLeitorSite(passo: string): boolean {
  const run = /^ {8}run: (.+)$/m.exec(passo)?.[1];
  return run === `pnpm exec playwright test tests/e2e/${SPEC_LEITOR_SITE} --workers=1 --reporter=list`;
}

function executaMetaAds(passo: string): boolean {
  return /^ {8}run: (.+)$/m.exec(passo)?.[1]
    === `pnpm exec playwright test tests/e2e/${SPEC_META_ADS} --workers=1 --reporter=list`;
}

function preparaCifraMeta(passo: string): boolean {
  return /^ {8}run: (.+)$/m.exec(passo)?.[1] === PREPARAR_CIFRA_META;
}

function pulaTeste(fonte: string): boolean {
  const arvore = ts.createSourceFile("spec.ts", fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let pula = false;
  const visitar = (no: ts.Node) => {
    if (ts.isCallExpression(no) && /^(?:test|test\.describe)\.(?:skip|fixme)$/.test(no.expression.getText(arvore))) {
      pula = true;
    }
    ts.forEachChild(no, visitar);
  };
  visitar(arvore);
  return pula;
}

function errosDaExecucaoDedicadaSite(workflow: string, spec: string): string[] {
  const erros: string[] = [];
  if (!listaDoWorkflow(workflow, "SPECS_PARTE_2").includes(SPEC_LEITOR_SITE)) erros.push("spec fora da parte 2");
  if (listaDoWorkflow(workflow, "FORA_DO_CI").includes(SPEC_LEITOR_SITE)) erros.push("spec declarada fora do CI");
  const passos = passosDoWorkflow(workflow).filter(executaLeitorSite);
  if (passos.length !== 1) erros.push("falta uma execução dedicada real do leitor de site");
  for (const passo of passos) {
    if (/^ {8}if: (.+)$/m.exec(passo)?.[1] !== "matrix.parte == 2") erros.push("execução dedicada pode ser pulada");
    if (/^ {8}continue-on-error:\s*(?:true|["']true["'])\s*$/m.test(passo)) erros.push("falha dedicada é ignorada");
    const env = /^ {8}env:\s*\n((?: {10}[^\n]*\n)+)/m.exec(passo)?.[1] ?? "";
    for (const flag of ["E2E_ONBOARDING_SITE_FIXTURE", "E2E_ONBOARDING_SYNTHETIC_PROVIDER"]) {
      if (!new RegExp(`^ {10}${flag}: ["']?1["']?$`, "m").test(env)) erros.push(`flag ausente: ${flag}`);
    }
  }
  if (pulaTeste(spec)) erros.push("spec contém skip/fixme");
  return erros;
}

/** A lista comum prova a ausência de configuração; somente esta segunda execução
 * prova consentimento e cookies Secure. Perder o passo não pode deixar o CI verde
 * medindo apenas o primeiro ramo da spec. Os valores são fixtures, não segredos. */
function errosDaExecucaoDedicadaMeta(workflow: string, spec: string): string[] {
  const erros: string[] = [];
  if (!listaDoWorkflow(workflow, "SPECS_PARTE_3").includes(SPEC_META_ADS)) erros.push("Meta Ads fora da parte 3");
  if (listaDoWorkflow(workflow, "FORA_DO_CI").includes(SPEC_META_ADS)) erros.push("Meta Ads declarada fora do CI");
  const passos = passosDoWorkflow(workflow).filter(executaMetaAds);
  const preparos = passosDoWorkflow(workflow).filter(preparaCifraMeta);
  if (preparos.length !== 1) erros.push("falta preparar a cifra real no banco local");
  for (const preparo of preparos) {
    if (/^ {8}if: (.+)$/m.exec(preparo)?.[1] !== "matrix.parte == 3") erros.push("preparo da cifra pode ser pulado");
    if (/^ {8}continue-on-error:\s*(?:true|["']true["'])\s*$/m.test(preparo)) erros.push("falha de cifra é ignorada");
    if (passos[0] && workflow.indexOf(preparo) > workflow.indexOf(passos[0])) erros.push("cifra preparada depois do OAuth");
  }
  if (passos.length !== 1) erros.push("falta uma execução dedicada real de Meta Ads");
  for (const passo of passos) {
    if (/^ {8}if: (.+)$/m.exec(passo)?.[1] !== "matrix.parte == 3") erros.push("execução Meta Ads pode ser pulada");
    if (/^ {8}continue-on-error:\s*(?:true|["']true["'])\s*$/m.test(passo)) erros.push("falha Meta Ads é ignorada");
    const env = /^ {8}env:\s*\n((?: {10}[^\n]*\n)+)/m.exec(passo)?.[1] ?? "";
    for (const [nome, valor] of Object.entries({
      E2E_META_ADS_FIXTURE: "1", E2E_LOCAL_HTTPS: "1",
      META_APP_ID: "123456789012345", META_APP_SECRET: "meta-ads-oauth-local-fixture-only",
      META_LOGIN_CONFIG_ID: "987654321098765",
    })) {
      if (!new RegExp(`^ {10}${nome}: ["']?${valor}["']?$`, "m").test(env)) erros.push(`fixture ausente: ${nome}`);
    }
  }
  if (pulaTeste(spec)) erros.push("Meta Ads contém skip/fixme");
  return erros;
}

const yml = readFileSync(WORKFLOW, "utf8");
const parte1 = listaDoWorkflow(yml, "SPECS_PARTE_1");
const parte2 = listaDoWorkflow(yml, "SPECS_PARTE_2");
const parte3 = listaDoWorkflow(yml, "SPECS_PARTE_3");
const foraDoCi = listaDoWorkflow(yml, "FORA_DO_CI");
const noDisco = readdirSync(DIR_SPECS)
  .filter((f) => f.endsWith(".spec.ts"))
  .sort();
const specLeitorSite = readFileSync(path.join(DIR_SPECS, SPEC_LEITOR_SITE), "utf8");
const specMetaAds = readFileSync(path.join(DIR_SPECS, SPEC_META_ADS), "utf8");

describe("cobertura do e2e no CI", () => {
  it("o parser está vivo — controle positivo antes de qualquer conclusão", () => {
    // Sem isto, um regex que parou de casar devolveria três listas vazias e a
    // asserção de vigência passaria por vacuidade, enquanto a de completude
    // acusaria as 39 specs de uma vez. Verde e vermelho errados pelo mesmo motivo.
    expect(noDisco.length, "nenhuma spec no disco — o diretório mudou de lugar?").toBeGreaterThan(30);
    expect(parte1.length, "SPECS_PARTE_1 não foi lida do workflow").toBeGreaterThan(10);
    expect(parte2.length, "SPECS_PARTE_2 não foi lida do workflow").toBeGreaterThan(10);
    expect(parte3.length, "SPECS_PARTE_3 não foi lida do workflow").toBeGreaterThan(10);
    expect(foraDoCi.length, "FORA_DO_CI não foi lida do workflow").toBeGreaterThan(0);
  });

  it("toda spec do disco está em exatamente uma lista", () => {
    const declaradas = [...parte1, ...parte2, ...parte3, ...foraDoCi];
    const semLista = noDisco.filter((f) => !declaradas.includes(f));
    expect(
      semLista,
      "Spec no disco que não roda no CI nem está declarada como fora. Ponha em " +
        "SPECS_PARTE_1/2/3 (se rodar sem WAHA/Redis/Resend) ou em FORA_DO_CI com o " +
        "motivo escrito. Cobertura parcial silenciosa se lê como cobertura total.\n",
    ).toEqual([]);

    // Duas listas não podem reivindicar a mesma spec: rodar duas vezes dobra
    // login num job que já vive perto do teto por IP.
    const duplicadas = declaradas.filter((f, i) => declaradas.indexOf(f) !== i);
    expect(duplicadas, "spec declarada em mais de uma lista").toEqual([]);
  });

  it("nenhuma lista nomeia spec que não existe mais", () => {
    // O sentido inverso, e ele é pior: `playwright test naoexiste.spec.ts` não
    // acha nada e o job termina VERDE. Uma renomeação silenciosamente desliga a
    // cobertura daquele arquivo.
    const fantasmas = [...parte1, ...parte2, ...parte3, ...foraDoCi].filter((f) => !noDisco.includes(f));
    expect(fantasmas, "lista do CI aponta para spec inexistente — renomeada ou apagada").toEqual([]);
  });

  /**
   * AQUI HAVIA UM CASO QUE COBRAVA O NÚMERO ESCRITO NO CLAUDE.md — e ele saiu
   * porque o número saiu de lá, o que é a solução MELHOR.
   *
   * Convergência independente, na mesma tarde: eu vi a contagem apodrecida
   * ("48 das 49" com 50 de 51 no repo), corrigi o número e escrevi um gate para
   * prendê-lo. Em paralelo, o time tratou o mesmo apodrecimento pela raiz —
   * apagou o número do CLAUDE.md e deixou no lugar o comando que o produz.
   *
   * A deles vence, e não por gentileza: é o que o DoD 16 daquele arquivo manda
   * fazer ("onde a afirmação puder virar comando, troque em vez de corrigir: um
   * número corrigido envelhece de novo; um `rode isto para saber` não envelhece
   * nunca"). Um gate que prende um número congela a manutenção dele para sempre;
   * tirar o número dissolve a classe inteira do problema.
   *
   * Não sobrou buraco: sem número no texto, não há o que divergir do workflow.
   * As três pontas que importam — disco→listas, listas→disco e listas→Playwright
   * — seguem cobradas pelos casos vizinhos.
   */
  it("as listas são de fato passadas ao Playwright", () => {
    // A terceira ponta. Declarar não é executar: sem o consumo, acrescentar o nome
    // à variável deixa este gate verde e a spec continua fora do run.
    //
    // As partes passaram a rodar em PARALELO (matrix), e o comando deixou de
    // citar a variável direto: ele escolhe a lista pela `matrix.parte`. A
    // propriedade que este caso guarda não mudou, então ele cobra a CADEIA
    // inteira em vez de uma linha literal — as duas variáveis chegam a `LISTA`,
    // e é `LISTA` que vai ao Playwright. Cobrar só o `--workers=1 $LISTA`
    // deixaria passar um workflow onde `LISTA` nunca é atribuída.
    expect(yml, "SPECS_PARTE_1 não alimenta a variável que roda").toMatch(/LISTA="\$SPECS_PARTE_1"/);
    expect(yml, "SPECS_PARTE_2 não alimenta a variável que roda").toMatch(/LISTA="\$SPECS_PARTE_2"/);
    expect(yml, "SPECS_PARTE_3 não alimenta a variável que roda").toMatch(/LISTA="\$SPECS_PARTE_3"/);
    expect(yml, "a lista escolhida não é passada ao Playwright").toMatch(
      /playwright test --workers=1 \$LISTA/,
    );
    // E FORA_DO_CI nunca é passada a um run — ela existe para NÃO rodar.
    expect(yml).not.toMatch(/playwright test[^\n]*\$FORA_DO_CI/);
    expect(yml).not.toMatch(/LISTA="\$FORA_DO_CI"/);
  });

  it("o agregador consegue ler o próprio workflow no repositório privado", () => {
    const agregador = /\n  e2e:\n([\s\S]*)$/.exec(yml)?.[1] ?? "";

    expect(agregador, "o job agregador e2e não foi encontrado").not.toBe("");
    expect(
      agregador,
      "o agregador faz checkout para medir cobertura e precisa de contents: read no repo privado",
    ).toMatch(/^    permissions:\n      contents: read$/m);
    expect(agregador, "o controle só vale enquanto o agregador ainda fizer checkout").toMatch(
      /^      - uses: actions\/checkout@v7$/m,
    );
  });

  it("o leitor de site tem execução dedicada com os dois preloads e não ganha skip", () => {
    expect(errosDaExecucaoDedicadaSite(yml, specLeitorSite)).toEqual([]);
  });

  it("Meta Ads roda sem configuração e também com OAuth HTTPS sintético, sem skip", () => {
    expect(errosDaExecucaoDedicadaMeta(yml, specMetaAds)).toEqual([]);
  });

  it("Meta Ads prepara a cifra real antes da jornada, sem chave fixa ou rotação", () => {
    const sql = readFileSync(path.join(DIR_SPECS, "helpers", "meta-ads-cifra.sql"), "utf8");
    const executavel = sql.replace(/--[^\n]*/g, "");
    expect(executavel).toMatch(/insert into private\.app_secrets/);
    expect(executavel).toMatch(/gen_random_bytes\(32\)/);
    expect(executavel).toMatch(/on conflict \(name\) do nothing/);
    expect(executavel).toMatch(/set local role service_role/);
    expect(executavel).toMatch(/public\.fn_encrypt_oauth\(controle\)/);
    expect(executavel).toMatch(/public\.fn_decrypt_oauth\(cifrado\) is distinct from controle/);
    expect(executavel).toMatch(/raise exception/);
  });

  it("SABOTAGEM Meta Ads: perder ou atrasar o preparo da cifra reprova", () => {
    const preparo = passosDoWorkflow(yml).find(preparaCifraMeta);
    expect(preparo, "controle positivo: passo de cifra local").toBeDefined();
    expect(errosDaExecucaoDedicadaMeta(yml.replace(preparo!, ""), specMetaAds))
      .toContain("falta preparar a cifra real no banco local");
    expect(errosDaExecucaoDedicadaMeta(yml.replace(preparo!, preparo!.replace("if: matrix.parte == 3", "if: false")), specMetaAds))
      .toContain("preparo da cifra pode ser pulado");
    expect(errosDaExecucaoDedicadaMeta(yml.replace(preparo!, `${preparo}\n        continue-on-error: true`), specMetaAds))
      .toContain("falha de cifra é ignorada");
    expect(errosDaExecucaoDedicadaMeta(`${yml.replace(preparo!, "")}\n${preparo}`, specMetaAds))
      .toContain("cifra preparada depois do OAuth");
    expect(errosDaExecucaoDedicadaMeta(yml.replace(PREPARAR_CIFRA_META, PREPARAR_CIFRA_META.replace("-v ON_ERROR_STOP=1 ", "")), specMetaAds))
      .toContain("falta preparar a cifra real no banco local");
  });

  it("SABOTAGEM Meta Ads: apagar a execução OAuth reprova mesmo mantendo a spec na lista", () => {
    const passo = passosDoWorkflow(yml).find(executaMetaAds);
    expect(passo, "controle positivo: execução OAuth precisa existir").toBeDefined();
    const sabotado = yml.replace(passo!, `      # run: pnpm exec playwright test tests/e2e/${SPEC_META_ADS} --workers=1 --reporter=list`);
    expect(listaDoWorkflow(sabotado, "SPECS_PARTE_3")).toContain(SPEC_META_ADS);
    expect(errosDaExecucaoDedicadaMeta(sabotado, specMetaAds)).toContain("falta uma execução dedicada real de Meta Ads");
  });

  it.each(["E2E_META_ADS_FIXTURE", "E2E_LOCAL_HTTPS", "META_APP_ID", "META_APP_SECRET", "META_LOGIN_CONFIG_ID"])(
    "SABOTAGEM Meta Ads: retirar %s do passo dedicado reprova", (flag) => {
      const passo = passosDoWorkflow(yml).find(executaMetaAds)!;
      const sabotado = yml.replace(passo, passo.replace(new RegExp(`^ {10}${flag}:.*\\n`, "m"), ""));
      expect(errosDaExecucaoDedicadaMeta(sabotado, specMetaAds)).toContain(`fixture ausente: ${flag}`);
    },
  );

  it("SABOTAGEM Meta Ads: desativar o passo, ignorar erro ou pular teste reprova", () => {
    const passo = passosDoWorkflow(yml).find(executaMetaAds)!;
    expect(errosDaExecucaoDedicadaMeta(yml.replace(passo, passo.replace("if: matrix.parte == 3", "if: false")), specMetaAds))
      .toContain("execução Meta Ads pode ser pulada");
    expect(errosDaExecucaoDedicadaMeta(yml.replace(passo, `${passo}\n        continue-on-error: true`), specMetaAds))
      .toContain("falha Meta Ads é ignorada");
    expect(errosDaExecucaoDedicadaMeta(yml.replace(/FORA_DO_CI:\s*>-/, `FORA_DO_CI: >-\n        ${SPEC_META_ADS}`), specMetaAds))
      .toContain("Meta Ads declarada fora do CI");
    for (const desvio of ["test.skip(true)", "test.describe.skip('OAuth', () => {})", "test.fixme(true)"]) {
      expect(errosDaExecucaoDedicadaMeta(yml, `${specMetaAds}\n${desvio}`)).toContain("Meta Ads contém skip/fixme");
    }
    expect(errosDaExecucaoDedicadaMeta(yml, `${specMetaAds}\n// test.skip(true)`)).toEqual([]);
  });

  it("SABOTAGEM: apagar o passo dedicado reprova, mesmo com o nome ainda na lista e num comentário", () => {
    const passo = passosDoWorkflow(yml).find(executaLeitorSite);
    expect(passo, "controle positivo: o passo real precisa existir antes de removê-lo").toBeDefined();
    const sabotado = yml.replace(passo!, `      # run: pnpm exec playwright test tests/e2e/${SPEC_LEITOR_SITE} --workers=1 --reporter=list`);
    expect(listaDoWorkflow(sabotado, "SPECS_PARTE_2")).toContain(SPEC_LEITOR_SITE);
    expect(errosDaExecucaoDedicadaSite(sabotado, specLeitorSite)).toContain("falta uma execução dedicada real do leitor de site");
  });

  it.each(["E2E_ONBOARDING_SITE_FIXTURE", "E2E_ONBOARDING_SYNTHETIC_PROVIDER"])(
    "SABOTAGEM: retirar %s só do passo do leitor reprova mesmo que outro passo ainda a tenha", (flag) => {
      const passo = passosDoWorkflow(yml).find(executaLeitorSite)!;
      const sabotado = yml.replace(passo, passo.replace(new RegExp(`^ {10}${flag}:.*\\n`, "m"), ""));
      expect(errosDaExecucaoDedicadaSite(sabotado, specLeitorSite)).toContain(`flag ausente: ${flag}`);
    },
  );

  it("SABOTAGEM: desativar o passo ou ignorar sua falha reprova", () => {
    const passo = passosDoWorkflow(yml).find(executaLeitorSite)!;
    expect(errosDaExecucaoDedicadaSite(yml.replace(passo, passo.replace("if: matrix.parte == 2", "if: false")), specLeitorSite))
      .toContain("execução dedicada pode ser pulada");
    expect(errosDaExecucaoDedicadaSite(yml.replace(passo, `${passo}\n        continue-on-error: true`), specLeitorSite))
      .toContain("falha dedicada é ignorada");
  });

  it("SABOTAGEM: declarar a spec fora ou adicionar skip/fixme reprova; comentário não é skip", () => {
    expect(errosDaExecucaoDedicadaSite(yml.replace(/FORA_DO_CI:\s*>-/, `FORA_DO_CI: >-\n        ${SPEC_LEITOR_SITE}`), specLeitorSite))
      .toContain("spec declarada fora do CI");
    for (const desvio of ["test.skip(true)", "test.describe.skip('jornada', () => {})", "test.fixme(true)"]) {
      expect(errosDaExecucaoDedicadaSite(yml, `${specLeitorSite}\n${desvio}`)).toContain("spec contém skip/fixme");
    }
    expect(errosDaExecucaoDedicadaSite(yml, `${specLeitorSite}\n// test.skip(true)`)).toEqual([]);
  });
});
