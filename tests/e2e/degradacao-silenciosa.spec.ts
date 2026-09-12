/**
 * A CERCA DA DEGRADAÇÃO SILENCIOSA.
 *
 * Em 25/07 o funil "CRM Vivo — Clínica" ficou de 2h13 a 3h09 sem entregar nada
 * por tempo real. Nesse intervalo 15 mudanças foram escritas e nenhuma chegou a
 * ninguém — e NENHUMA tela avisou. Medido em três superfícies, com proxy e
 * controle positivo (`tests/prova-raio-do-silencio.ts`, evidência em
 * `evidence/raio-x-realtime.md`).
 *
 * Este critério existe porque aquele defeito vai ser consertado e a degradação
 * silenciosa NÃO. Ela sobrevive a qualquer causa: basta a entrega morrer por um
 * motivo novo — e o usuário volta a ver dado velho com cara de saudável.
 *
 * O QUE ELE MEDE, e a escolha do observável veio antes da asserção:
 *   escopo      — o que um humano vê na tela depois de uma mudança que deveria
 *                 ter chegado ao vivo;
 *   invariância — exige que a tela DIGA ALGUMA COISA, nunca uma forma
 *                 específica. Um badge, um texto, um aviso: qualquer um passa.
 *                 Exigir o meu formato reprovaria uma tela que avisa de outro
 *                 jeito, que é o falso vermelho que me pegou sete vezes na wave 6.
 *
 * ─── DETECTOR E AVISO SÃO CONTRATOS DIFERENTES ──────────────────────────
 *
 * Quem pegar esta lacuna não precisa inventar detecção — ela existe e só não
 * virou aviso. `hooks/realtime/useRefetchDeSeguranca.ts:116` calcula:
 *
 *     const perdeu = mudou && !canalTrouxe;
 *
 * "a tela mudou E o canal não trouxe" só é verdade com o canal ASSINADO E MUDO
 * — que é exatamente a distinção que o `data-realtime-status` não faz e que o
 * parágrafo acima diz não existir. Um contador que só incrementa nesse estado
 * É o detector.
 *
 * Ele já é publicado no DOM como `data-refetch-divergencias`, inclusive em
 * (`app/app/pipelines/[id]/_client.tsx` e `components/kanban/LeadDossier.tsx`).
 * Sem número de linha de propósito: achar por
 * `grep -rn data-refetch-divergencias` responde certo em qualquer branch, e um
 * número envelhece no primeiro commit que mexer no arquivo — inclusive neste.
 *
 * A régua acompanha o ciclo real de 45s: entrega positiva, entrega suprimida,
 * assinatura ainda viva, divergência detectada, dado recuperado e aviso humano.
 * Recuperar o dado não substitui o aviso. Esperar 12s e exigir dado ausente
 * testava outra janela e não alcançava este detector. Sem `test.fail`: qualquer
 * falha de pré-condição, recuperação ou aviso agora é um vermelho real.
 * Escopo desta prova: quadro do funil; não afirma cobertura do Inbox/dossiê.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { email: string }>;
}

function loadCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
}

function envLocal(): Record<string, string> {
  // `process.env` vence o `.env.local`, e a ausência do arquivo não é erro —
  // ver scripts/lib/env-de-teste.ts.
  return carregarEnvLocal();
}

/**
 * Vocabulário de degradação, deliberadamente largo. O critério é "a tela diz
 * alguma coisa sobre estar desatualizada", não "a tela diz do meu jeito".
 */
const AVISO =
  /(offline|sem conex|desconect|reconect|desatualiz|atualiz(ando|e a p)|tempo real|ao vivo|pausad|erro de conex|sem sinal|parad)/i;

/** Entrega de verdade num quadro do Phoenix: `[join_ref, ref, topic, event, payload]`.
 *  O `phx_reply` que confirma a assinatura carrega as mesmas palavras no corpo —
 *  só a POSIÇÃO separa recibo de entrega. Casar por substring conta recibo como
 *  entrega; exigir uma chave `"event":` não casa nada. Já errei os dois. */
function ehEntrega(bruto: string): boolean {
  try {
    const q: unknown = JSON.parse(bruto);
    return Array.isArray(q) && q[3] === "postgres_changes";
  } catch {
    return false;
  }
}

test.describe("degradação silenciosa do tempo real", () => {
  test("com a entrega morta, a tela avisa que pode estar desatualizada", async ({ page }, testInfo) => {
    // Duas verificações reais de 45s, login e rede. As esperas terminam pelo
    // estado observado; não mudamos a cadência do produto para acelerar a prova.
    test.setTimeout(180_000);

    const creds = loadCreds();
    const env = envLocal();
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let engolidos = 0;
    let quadrosTotais = 0;
    let bloquear = false;
    // O PROXY MATA A ENTREGA SEM DERRUBAR O CANAL: engole só os quadros de dados
    // e deixa passar join, phx_reply e heartbeat. Fechar o socket seria outro
    // defeito — visível — e mediria uma tela que não é a que interessa.
    await page.routeWebSocket(/realtime/i, (route) => {
      const servidor = route.connectToServer();
      route.onMessage((m) => servidor.send(m));
      servidor.onMessage((m) => {
        quadrosTotais++;
        if (bloquear && ehEntrega(String(m))) {
          engolidos++;
          return;
        }
        route.send(m);
      });
    });

    await page.goto("/login");
    await page.getByLabel(/e-?mail/i).fill(creds.users.manager!.email);
    await page.getByLabel(/senha/i).fill(creds.password);
    await page.getByRole("button", { name: /entrar|acessar/i }).click();
    await page.waitForURL(/\/app\//, { timeout: 30_000 });

    const { data: pipes, error: erroPipes } = await admin
      .from("crm_pipelines")
      .select("id")
      .eq("organization_id", creds.org_id)
      .order("created_at")
      .limit(1);
    expect(erroPipes).toBeNull();
    expect(pipes?.length).toBe(1);
    const pipelineId = ((pipes ?? [])[0] as { id: string }).id;
    await page.goto(`/app/pipelines/${pipelineId}`);
    const quadro = page.locator("[data-refetch-divergencias]").first();
    await expect(quadro).toHaveAttribute("data-realtime-status", "subscribed");

    const { data: leads, error: erroLeads } = await admin
      .from("crm_leads")
      .select("id,title")
      .eq("pipeline_id", pipelineId)
      .eq("organization_id", creds.org_id)
      .order("id")
      .limit(1);
    expect(erroLeads).toBeNull();
    expect(leads?.length).toBe(1);
    const lead = (leads ?? [])[0] as { id: string; title: string };

    const marca = `CERCA${Date.now()}`;
    let corpoFalhou = false;
    const alterar = (title: string) => admin.from("crm_leads").update({ title })
      .eq("id", lead.id).eq("organization_id", creds.org_id);
    try {
      // Controle positivo: uma entrega viva atualiza a tela sem acusar falha.
      expect((await alterar(`${lead.title} VIVO${marca}`)).error).toBeNull();
      await expect(quadro.getByText(`${lead.title} VIVO${marca}`, { exact: true })).toBeVisible();
      expect(await quadro.innerText()).not.toMatch(AVISO);
      // A primeira verificação separa a entrega positiva da perda seguinte.
      // O produto usa 45s; 12s não exercitavam o detector. Esperamos seu estado,
      // não um sleep nem uma nova cadência criada apenas para o teste.
      await expect(quadro).toHaveAttribute("data-refetch-em", /\d+/, { timeout: 60_000 });
      const verificacaoAntes = await quadro.getAttribute("data-refetch-em");
      const divergenciasAntes = Number(await quadro.getAttribute("data-refetch-divergencias"));
      expect(divergenciasAntes, "entrega saudável não deve acusar perda").toBe(0);
      expect(await quadro.innerText()).not.toMatch(AVISO);
      const engolidosAntes = engolidos;
      bloquear = true;
      expect((await alterar(`${lead.title} PERDIDO${marca}`)).error).toBeNull();
      await expect.poll(() => engolidos, { message: `entrega não suprimida (${quadrosTotais} quadros)` }).toBeGreaterThan(engolidosAntes);
      await expect(quadro).toHaveAttribute("data-realtime-status", "subscribed");
      await expect(quadro.getByText(`${lead.title} PERDIDO${marca}`, { exact: true })).toHaveCount(0);
      await expect.poll(async () => ({
        novaVerificacao: await quadro.getAttribute("data-refetch-em") !== verificacaoAntes,
        detectou: Number(await quadro.getAttribute("data-refetch-divergencias")) > divergenciasAntes,
        recuperou: await quadro.getByText(`${lead.title} PERDIDO${marca}`, { exact: true }).isVisible(),
      }), { timeout: 60_000 }).toEqual({ novaVerificacao: true, detectou: true, recuperou: true });
      await expect(quadro).toHaveAttribute("data-realtime-status", "subscribed");
      const texto = await quadro.innerText();
      const evidencia = testInfo.outputPath("degradacao-medida.json");
      fs.writeFileSync(evidencia, JSON.stringify({
        assinatura: await quadro.getAttribute("data-realtime-status"),
        entregasSuprimidas: engolidos - engolidosAntes,
        divergenciasAntes,
        divergenciasDepois: Number(await quadro.getAttribute("data-refetch-divergencias")),
        marcaRecuperada: true,
        avisoVisivel: AVISO.test(texto),
      }, null, 2));
      await testInfo.attach("degradacao-medida", { contentType: "application/json", path: evidencia });
      await page.screenshot({ path: testInfo.outputPath("degradacao-aviso.png") });
      expect(texto, "o detector recuperou o dado perdido, mas não avisou o operador").toMatch(AVISO);
    } catch (error) {
      corpoFalhou = true;
      throw error;
    } finally {
      bloquear = false;
      const { error } = await alterar(lead.title);
      if (error) {
        testInfo.annotations.push({ type: "limpeza", description: "Não foi possível restaurar o título sintético do lead." });
        // Não substituir a causa do corpo por outra exceção no finally.
        if (!corpoFalhou) throw new Error("Não foi possível restaurar o título sintético do lead.");
      }
    }
  });
});
