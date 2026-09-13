import { randomUUID } from "node:crypto";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decidirElegibilidadeDaConversa } from "@/lib/ai/elegibilidade/consulta-pg";
import { redriveQueued, type WatchdogConfig } from "@/lib/agent-engine/edge/crm/session-reconciler";
import { createLogger } from "@/lib/agent-engine/obs/logger";
import { activate, agentState, channel, confirm, db, fixture, type Fixture } from "../db/onboarding-concluir-fixture";
import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";

/**
 * A marca de principal NÃO é uma autorização para atender o público.
 *
 * O agente nasce pelas RPCs de salvar → preparar → ensaiar → revisar → ativar,
 * não por INSERT de um default pronto. Depois de conferir o default publicado
 * por SQL E PostgREST reais, exercitamos a consulta usada pelo engine e o sink
 * de reenvio com um receiver HTTP real. Nenhum mock de fetch/gate/transporte.
 *
 * O registro de LLM do ensaio e as respostas queued são fixtures: não alegamos
 * chamada real de LLM nem pareamento com um celular. O efeito externo medido é
 * /api/sendText recebido em loopback. O banco é exclusivo deste arquivo,
 * via test:db.
 */

interface EnvioRecebido {
  session: string;
  chatId: string;
  text: string;
  apiKey: string | undefined;
}

const TELEFONE_DE_TESTE = "+5511999998888";
const TELEFONE_FORA_DA_LISTA = "+5511999997777";
const CHAVE_SINTETICA = "onboarding-principal-receiver-only";
const recebidos: EnvioRecebido[] = [];
let receiver: http.Server | undefined;
let postgrest: PostgrestLocal | undefined;
let porta = 0;

beforeAll(async () => {
  postgrest = await subirPostgrestLocal();
  receiver = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/api/sendText") {
      response.writeHead(404).end();
      return;
    }
    let corpo = "";
    request.setEncoding("utf8");
    request.on("data", (parte: string) => { corpo += parte; });
    request.on("end", () => {
      try {
        const payload = JSON.parse(corpo) as Omit<EnvioRecebido, "apiKey">;
        recebidos.push({ ...payload, apiKey: request.headers["x-api-key"] as string | undefined });
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: { id: `onboarding-receiver-${recebidos.length}` } }));
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    receiver!.once("error", reject);
    receiver!.listen(0, "127.0.0.1", resolve);
  });
  const endereco = receiver.address();
  if (endereco === null || typeof endereco === "string") throw new Error("Receiver sem porta loopback.");
  porta = endereco.port;
});

afterAll(async () => {
  try {
    if (receiver) await new Promise<void>((resolve, reject) => {
      receiver!.close((error) => error ? reject(error) : resolve());
    });
  } finally {
    await postgrest?.encerrar();
  }
});

async function respostaEnfileirada(f: Fixture, canal: string, telefone: string) {
  const contato = randomUUID();
  const conversa = randomUUID();
  const mensagem = randomUUID();
  // Mesmo o contato EXTERNO tem autorização global recente (campanha antiga).
  // Ela não pode passar à frente da lista restrita que o operador aprovou.
  await db.query(
    "insert into contacts(id,organization_id,phone_number,ai_authorized_at) values($1,$2,$3,now())",
    [contato, f.org, telefone],
  );
  await db.query(
    "insert into conversations(id,organization_id,contact_id,channel_session_id,status,is_group,active_ai_agent_id) values($1,$2,$3,$4,'open',false,$5)",
    [conversa, f.org, contato, canal, f.agent],
  );
  await db.query(
    `insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,
                          type,direction,status,body,sent_via,sent_at,created_at,metadata)
     values($1,$2,$3,$4,$5,'text','outbound','queued','Resposta QA do funcionário principal','ai',
            now(),now()-interval '1 minute',jsonb_build_object('ai_actor_id',$6::text))`,
    [mensagem, f.org, conversa, canal, contato, f.agent],
  );
  return { contato, conversa, mensagem };
}

describe("funcionário principal mantém a ativação restrita no transporte real", () => {
  it("default promovido envia ao testador e bloqueia fora da lista mesmo com autorização anterior", async () => {
    const f = await fixture();
    await confirm(f);
    const canal = await channel(f.org, { numbers: [TELEFONE_DE_TESTE] });
    await activate(f, canal);
    expect(await agentState(f)).toEqual({
      is_default: true,
      is_active: true,
      published_version_id: f.version,
    });
    // O que a API enxerga é o mesmo default que acabou de ser promovido.
    const api = postgrest!.cliente("service_role");
    const lido = await api.from("ai_agents").select("id,is_default,published_version_id")
      .eq("organization_id", f.org).eq("id", f.agent).single();
    expect(lido.error).toBeNull();
    expect(lido.data).toEqual({ id: f.agent, is_default: true, published_version_id: f.version });

    const testador = await respostaEnfileirada(f, canal, TELEFONE_DE_TESTE);
    const externo = await respostaEnfileirada(f, canal, TELEFONE_FORA_DA_LISTA);
    for (const [alvo, permite, motivo] of [
      [testador, true, "numero_de_teste"],
      [externo, false, "fora_da_lista_de_teste"],
    ] as const) {
      expect(await decidirElegibilidadeDaConversa(db, {
        organizationId: f.org, conversationId: alvo.conversa, agora: new Date(), ttlMs: 86_400_000,
      })).toMatchObject({ permite, motivo });
    }

    const config: WatchdogConfig = {
      wahaBaseUrl: `http://127.0.0.1:${porta}`,
      wahaApiKey: CHAVE_SINTETICA,
      intervalMs: 1000,
      redriveMinAgeMs: 0,
      redriveBatchSize: 10,
      redriveSpacingMs: 1,
    };
    expect(await redriveQueued(db, config, createLogger())).toBe(1);
    expect(recebidos).toEqual([{
      session: canal,
      chatId: `${TELEFONE_DE_TESTE.slice(1)}@c.us`,
      text: "Resposta QA do funcionário principal",
      apiKey: CHAVE_SINTETICA,
    }]);
    const estados = await api.from("messages")
      .select("id,status,error_code,external_id,metadata")
      .eq("organization_id", f.org).in("id", [testador.mensagem, externo.mensagem]);
    expect(estados.error).toBeNull();
    expect(estados.data).toHaveLength(2);
    expect(estados.data!.find((message) => message.id === testador.mensagem)).toMatchObject({
      status: "sent", external_id: "onboarding-receiver-1", metadata: { ai_actor_id: f.agent },
    });
    expect(estados.data!.find((message) => message.id === externo.mensagem)).toMatchObject({
      status: "failed", error_code: "pre_go_live", external_id: null, metadata: { ai_actor_id: f.agent },
    });
    // Repetir o tick não ressuscita a resposta bloqueada nem duplica a enviada.
    expect(await redriveQueued(db, config, createLogger())).toBe(0);
    expect(recebidos).toHaveLength(1);
    expect(await agentState(f)).toMatchObject({ is_default: true, published_version_id: f.version });
    const acesso = await api.from("channel_sessions").select("metadata")
      .eq("organization_id", f.org).eq("id", canal).single();
    expect(acesso.error).toBeNull();
    expect(acesso.data?.metadata).toMatchObject({
      ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [TELEFONE_DE_TESTE],
    });
  });
});
