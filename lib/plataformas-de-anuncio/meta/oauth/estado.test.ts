// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assinarEstado, assinarLink, conferirVinculoNavegador, gerarVinculoNavegador,
  hashVinculoNavegador, VALIDADE_ESTADO_MS, VALIDADE_LINK_MS, verificarEstado, verificarLink,
} from "./estado";

const agora = new Date("2026-09-15T12:00:00.000Z");
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const link = { requestId, expiresAt: agora.getTime() + VALIDADE_LINK_MS };
const estado = { requestId, organizationId, userId, expiresAt: agora.getTime() + VALIDADE_ESTADO_MS };
beforeEach(() => vi.stubEnv("INTERNAL_SECRET", "segredo-exclusivamente-ficticio-para-suite-123"));
afterEach(() => vi.unstubAllEnvs());

describe("assinatura separada de link e sessão", () => {
  it("link contém apenas recibo opaco e prazo, nunca org ou usuário", () => {
    const token = assinarLink(link, agora)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(token.length).toBeLessThan(2048);
    expect(verificarLink(token, agora)).toEqual(link);
    const carga = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
    expect(carga).toEqual({ v: 1, issuedAt: agora.getTime(), dados: link });
    expect(JSON.stringify(carga)).not.toMatch(/organizationId|userId/);
  });
  it("state preserva vínculos do servidor e é de propósito diferente do link", () => {
    const token = assinarEstado(estado, agora)!;
    expect(verificarEstado(token, agora)).toEqual(estado);
    expect(verificarLink(token, agora)).toBeNull();
    expect(verificarEstado(assinarLink(link, agora), agora)).toBeNull();
  });
  it("rejeita assinatura adulterada, mesmo com payload válido", () => {
    const token = assinarLink(link, agora)!;
    const [carga, assinatura] = token.split(".");
    const alterada = assinatura![0] === "0" ? "1" : "0";
    expect(verificarLink(`${carga}.${alterada}${assinatura!.slice(1)}`, agora)).toBeNull();
    const tokenEstado = assinarEstado(estado, agora)!;
    expect(verificarEstado(`${tokenEstado.slice(0, -1)}${tokenEstado.endsWith("0") ? "1" : "0"}`, agora)).toBeNull();
  });
  it("rejeita trocar o conteúdo sem refazer HMAC", () => {
    const token = assinarLink(link, agora)!;
    const carga = Buffer.from(JSON.stringify({ v: 1, issuedAt: agora.getTime(), dados: { ...link, requestId: userId } })).toString("base64url");
    expect(verificarLink(`${carga}.${token.split(".")[1]}`, agora)).toBeNull();
  });
  it("vence exatamente no prazo e continua válido um milissegundo antes", () => {
    const token = assinarLink(link, agora)!;
    expect(verificarLink(token, new Date(link.expiresAt - 1))).toEqual(link);
    expect(verificarLink(token, new Date(link.expiresAt))).toBeNull();
    expect(verificarLink(token, new Date(link.expiresAt + 1))).toBeNull();
    const sessao = assinarEstado(estado, agora)!;
    expect(verificarEstado(sessao, new Date(estado.expiresAt - 1))).toEqual(estado);
    expect(verificarEstado(sessao, new Date(estado.expiresAt))).toBeNull();
  });
  it("recusa emissão futura, expirada e prazo acima de cada teto", () => {
    expect(verificarLink(assinarLink(link, agora), new Date(agora.getTime() - 1))).toBeNull();
    expect(assinarLink({ ...link, expiresAt: agora.getTime() }, agora)).toBeNull();
    expect(assinarLink({ ...link, expiresAt: link.expiresAt + 1 }, agora)).toBeNull();
    expect(assinarEstado({ ...estado, expiresAt: estado.expiresAt + 1 }, agora)).toBeNull();
  });
  it.each(["", "curto", "x".repeat(31)])("secret ausente ou insuficiente não recebe fallback (%s)", (secret) => {
    const valido = assinarLink(link, agora)!;
    vi.stubEnv("INTERNAL_SECRET", secret);
    expect(assinarLink(link, agora)).toBeNull();
    expect(verificarLink(valido, agora)).toBeNull();
  });
  it("não aceita UUID inválido, campos extras ou datas inválidas", () => {
    expect(assinarLink({ ...link, requestId: "não-é-id" }, agora)).toBeNull();
    expect(assinarLink({ ...link, organizationId } as typeof link, agora)).toBeNull();
    expect(assinarEstado({ ...estado, userId: "123" }, agora)).toBeNull();
    expect(assinarEstado(estado, new Date("inválida"))).toBeNull();
    expect(verificarLink(assinarLink(link, agora), new Date("inválida"))).toBeNull();
  });
  it.each([null, undefined, "", "a.b", "a." + "0".repeat(64), "x".repeat(2049)])("malformado não lança", (token) => {
    expect(verificarLink(token, agora)).toBeNull();
    expect(verificarEstado(token, agora)).toBeNull();
  });
});

describe("vínculo aleatório de navegador", () => {
  it("tem 256 bits, não repete e confere apenas o hash correto", () => {
    const bruto = gerarVinculoNavegador();
    const outro = gerarVinculoNavegador();
    expect(Buffer.from(bruto, "base64url")).toHaveLength(32);
    expect(bruto).not.toBe(outro);
    const hash = hashVinculoNavegador(bruto)!;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(bruto);
    expect(conferirVinculoNavegador(bruto, hash)).toBe(true);
    expect(conferirVinculoNavegador(outro, hash)).toBe(false);
  });
  it.each([null, undefined, "", "x", "x".repeat(44)])("entrada inválida é fechada", (valor) => {
    expect(hashVinculoNavegador(valor)).toBeNull();
    expect(conferirVinculoNavegador(valor, "0".repeat(64))).toBe(false);
  });
  it("recusa hash malformado sem comparação que lance", () => {
    expect(conferirVinculoNavegador(gerarVinculoNavegador(), "curto")).toBe(false);
  });
});
