import { describe, expect, it } from "vitest";

import { redigirMensagemDoProvedor } from "@/lib/agent-engine/edge/llm/run-model-call";

describe("redação de erros dos provedores de IA", () => {
  it.each([
    "Authorization: Bearer token.super-secreto_123456",
    "Bearer token.super-secreto_123456",
    "x-api-key: chave-super-secreta-123456",
    "api_key=chave-super-secreta-123456",
    "Incorrect API key sk-proj-segredo_super_longo_123456",
    "Google rejected AIzaSySegredoSuperLongo1234567890",
  ])("não devolve credencial ao browser ou ao banco: %s", (mensagem) => {
    const redigida = redigirMensagemDoProvedor(mensagem);

    expect(redigida).toContain("[CHAVE]");
    expect(redigida).not.toMatch(/token\.super-secreto|chave-super-secreta|sk-proj-segredo|AIzaSySegredo/);
  });
});
