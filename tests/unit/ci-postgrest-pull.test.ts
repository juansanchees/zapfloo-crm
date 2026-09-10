// Executa o Bash REAL do workflow. Só registro e relógio são dublados:
// uma falha transitória deve recuperar; esgotar tentativas deve reprovar.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function passoDoPull() {
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
  const job = workflow.split(/^  invariants:\s*$/m)[1]?.split(/^  \S/m)[0] ?? "";
  // Recorte estreito, com controle positivo: parser que não acha o passo falha.
  const passos = job.split(/^      - /m);
  const indice = passos.findIndex((passo) => /^        id: pull-postgrest$/m.test(passo));
  expect(indice, "invariants precisa preparar o PostgREST antes dos testes").toBeGreaterThan(0);
  const banco = passos.findIndex((passo) => /^        run: pnpm test:db$/m.test(passo));
  expect(banco, "o gate de banco deve continuar depois do pull").toBeGreaterThan(indice);
  const passo = passos[indice]!;
  expect(passo).not.toMatch(/continue-on-error:|^        if:/m);
  expect(passo).toMatch(/^        timeout-minutes: [1-5]$/m);
  const linhas = passo.split(/^        run: \|\s*$/m)[1];
  expect(linhas, "o shell do passo precisa ser executável pelo teste").toBeTruthy();
  const script = linhas!.split("\n").filter((linha) => linha.startsWith("          "))
    .map((linha) => linha.slice(10)).join("\n");
  expect(script.trim()).not.toBe("");
  return script;
}

function executar(falhas: number) {
  const script = passoDoPull();
  // Não há rede/Docker real nesta prova de retentativa. O CI exerce a imagem
  // real e os 167 arquivos de banco; aqui exercitamos o controle de fluxo.
  const resultado = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", `
    chamadas=0
    docker() {
      printf 'DOCKER:%s\\n' "$*"
      chamadas=$((chamadas + 1))
      if (( chamadas <= ${falhas} )); then
        printf 'toomanyrequests: Rate exceeded\\n' >&2
        return 125
      fi
    }
    sleep() { printf 'SLEEP:%s\\n' "$1"; }
    ${script}
  `], { encoding: "utf8", timeout: 5_000 });
  expect(resultado.error).toBeUndefined();
  expect(resultado.signal).toBeNull();
  return {
    ...resultado,
    chamadas: resultado.stdout.split("\n").filter((linha) => linha.startsWith("DOCKER:")),
    esperas: resultado.stdout.split("\n").filter((linha) => linha.startsWith("SLEEP:")),
  };
}

const pull = "DOCKER:pull public.ecr.aws/supabase/postgrest:v14.5";

describe("pull de PostgREST antes dos invariantes", () => {
  it("puxa uma vez e segue sem espera quando o registro responde", () => {
    const resultado = executar(0);
    expect(resultado.status).toBe(0);
    expect(resultado.chamadas).toEqual([pull]);
    expect(resultado.esperas).toEqual([]);
  });

  it("recupera dois rate limits com backoff e para ao obter a imagem", () => {
    const resultado = executar(2);
    expect(resultado.status).toBe(0);
    expect(resultado.chamadas).toEqual([pull, pull, pull]);
    expect(resultado.esperas).toEqual(["SLEEP:10", "SLEEP:20"]);
  });

  it("reprova explicitamente após cinco falhas, sem dormir após a última", () => {
    const resultado = executar(5);
    expect(resultado.status).toBe(1);
    expect(resultado.chamadas).toEqual([pull, pull, pull, pull, pull]);
    expect(resultado.esperas).toEqual(["SLEEP:10", "SLEEP:20", "SLEEP:40", "SLEEP:80"]);
    expect(resultado.stderr).toContain("::error::");
    expect(resultado.stderr).toContain("PostgREST");
  });
});
