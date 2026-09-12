import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("credenciais e tokens — todas as portas do servidor têm o mesmo gate", () => {
  it.each([
    ["app/api/v1/ai/credentials/route.ts", 2],
    ["app/api/v1/ai/credentials/[id]/route.ts", 1],
    ["app/api/v1/ai/credentials/[id]/revalidate/route.ts", 1],
    ["app/api/v1/settings/api-tokens/route.ts", 2],
    ["app/api/v1/settings/api-tokens/[id]/revoke/route.ts", 1],
  ] as const)("%s exige platformOnly em cada handler", (arquivo, handlers) => {
    expect(fonte(arquivo).match(/platformOnly:\s*true/g)).toHaveLength(handlers);
  });

  it.each([
    "app/app/ai/credentials/page.tsx",
    "app/app/settings/api-tokens/page.tsx",
  ])("%s bloqueia URL direta pelo sinal do usuário autenticado", (arquivo) => {
    const src = fonte(arquivo);
    expect(src).toMatch(/!user\.is_platform_admin/);
    expect(src).toMatch(/redirect\("\/403"\)/);
  });

  it("a Server Action legada do onboarding também recusa tenant", () => {
    expect(fonte("app/actions/onboarding/chaveDaIa.ts")).toMatch(
      /!user\.is_platform_admin/,
    );
  });

  it("a preparação do onboarding recusa credencial escolhida pelo browser tenant", () => {
    const src = fonte("app/actions/onboarding/prepararRascunho.ts");
    expect(src).toContain("!user.is_platform_admin && parsed.data.credential_id !== null");
    expect(src).toContain('error: "forbidden"');
  });
});

describe("seleção indireta de credencial não contorna a tela protegida", () => {
  it.each([
    "app/api/v1/ai/agents/route.ts",
    "app/api/v1/ai/agents/[id]/versions/route.ts",
    "app/api/v1/ai/agents/[id]/versions/[vid]/route.ts",
    "app/app/ai/agents/[id]/_actions.ts",
  ])("%s aplica a política ao receber credential_id", (arquivo) => {
    const src = fonte(arquivo);
    expect(src).toContain("podeManterSelecaoDeCredencial({");
    expect(src).toContain("isPlatformAdmin: authUser.is_platform_admin");
  });

  it("provedores preservam credencial e endpoint para tenant e só aceitam troca da plataforma", () => {
    const src = fonte("app/api/v1/ai/providers/route.ts");
    expect(src).toContain("corpo.credential_id !== undefined || corpo.base_url !== undefined");
    expect(src).toContain("credentialId = corpo.credential_id ?? null");
    expect(src).toContain("bindingAtual?.credential_id && bindingAtual.provider === corpo.provider");
    expect(src).toContain("resolverCredencialGerenciada({");
    expect(src).toContain("bancoDeEscrita = admin");
    expect(src).toContain("baseUrl = bindingAtual?.base_url ?? null");
  });

  it("tenant não recebe nem edita o endpoint que receberia a chave", () => {
    const api = fonte("app/api/v1/ai/providers/route.ts");
    const tela = fonte("app/app/ai/providers/_components/PainelDeProvedores.tsx");
    const runtime = fonte("lib/agent-engine/edge/llm/run-model-call.ts");
    expect(api).toContain("authz.user.is_platform_admin ? decisao.baseUrl : null");
    expect(tela).toContain("aceitaEndpointProprio && dados.podeGerenciarCredenciais");
    expect(tela).toContain("...(dados.podeGerenciarCredenciais");
    expect(runtime).toContain("decisao.baseUrl !== null && decisao.credentialId !== null");
    expect(runtime).toContain("strictCredential: true");
  });
});
