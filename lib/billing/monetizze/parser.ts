import { createHash } from "node:crypto";

export type StatusComercialDoPostback = "ativo" | "recusado" | "cancelado" | null;

export type EventoMonetizzeNormalizado = {
  accountKey: string;
  webhookId: string;
  saleCode: string;
  saleStatus: string;
  eventCode: string;
  eventKind: string;
  eventAt: string;
  installmentNumber: number | null;
  productCode: string;
  subscriptionCode: string | null;
  planReference: string | null;
  buyerEmail: string | null;
  sourceReference: string | null;
  targetStatus: StatusComercialDoPostback;
  paymentConfirmedAt: string | null;
};

export type ResultadoParserMonetizze =
  | { ok: true; value: EventoMonetizzeNormalizado }
  | { ok: false; code: "invalid_json" | "invalid_payload" | "missing_required_field" };

type Leitor = (caminho: string) => string | null;

function texto(valor: unknown): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const limpo = String(valor).trim();
  return limpo || null;
}

function leitorJson(payload: Record<string, unknown>): Leitor {
  return (caminho) => {
    const partes = caminho.replaceAll("]", "").split("[");
    let atual: unknown = payload;
    for (const parte of partes) {
      if (!atual || typeof atual !== "object" || Array.isArray(atual)) return null;
      atual = (atual as Record<string, unknown>)[parte];
    }
    return texto(atual);
  };
}

function primeiro(leitor: Leitor, ...caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    const valor = leitor(caminho);
    if (valor !== null) return valor;
  }
  return null;
}

function codigoDoEvento(leitor: Leitor): string | null {
  const explicito = primeiro(leitor, "postback_evento", "tipoEvento[codigo]", "codigo_status");
  if (explicito) return explicito;
  const status = primeiro(leitor, "venda[status]", "assinatura[status]")?.toLowerCase();
  if (status === "finalizada" || status === "aprovada" || status === "ativa") return "2";
  if (status === "cancelada") return "103";
  if (status === "inadimplente" || status === "bloqueada") return "102";
  return null;
}

function regraDoEvento(codigo: string): {
  kind: string;
  targetStatus: StatusComercialDoPostback;
  paymentConfirmed: boolean;
} {
  if (codigo === "2" || codigo === "101") {
    return { kind: codigo === "2" ? "sale.approved" : "subscription.active", targetStatus: "ativo", paymentConfirmed: true };
  }
  if (codigo === "3" || codigo === "4" || codigo === "9" || codigo === "103") {
    return { kind: "subscription.cancelled", targetStatus: "cancelado", paymentConfirmed: false };
  }
  if (codigo === "5" || codigo === "102") {
    return { kind: "subscription.payment_failed", targetStatus: "recusado", paymentConfirmed: false };
  }
  return { kind: `monetizze.${codigo}`, targetStatus: null, paymentConfirmed: false };
}

/** A Monetizze publica datas civis sem offset; a conta brasileira usa Brasília. */
function instante(valor: string): string | null {
  const civil = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(valor);
  const data = civil
    ? new Date(`${civil[1]}-${civil[2]}-${civil[3]}T${civil[4]}:${civil[5]}:${civil[6]}-03:00`)
    : new Date(valor);
  return Number.isFinite(data.getTime()) ? data.toISOString() : null;
}

function inteiroNaoNegativo(valor: string | null): number | null {
  if (valor === null || !/^\d+$/.test(valor)) return null;
  const numero = Number.parseInt(valor, 10);
  return Number.isSafeInteger(numero) ? numero : null;
}

function idLegado(partes: string[]): string {
  return `legacy_${createHash("sha256").update(partes.join("\u001f"), "utf8").digest("hex")}`;
}

export function parseMonetizzePayload(raw: string, contentType: string): ResultadoParserMonetizze {
  let leitor: Leitor;
  if (contentType.toLowerCase().includes("application/json")) {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, code: "invalid_json" };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, code: "invalid_payload" };
    }
    leitor = leitorJson(payload as Record<string, unknown>);
  } else {
    const campos = new URLSearchParams(raw);
    leitor = (caminho) => texto(campos.get(caminho));
  }

  const accountKey = leitor("chave_unica");
  const saleCode = primeiro(leitor, "codigo_venda", "venda[codigo]");
  const eventCode = codigoDoEvento(leitor);
  const productCode = primeiro(leitor, "codigo_produto", "produto[codigo]");
  const eventAtRaw = primeiro(
    leitor,
    "data",
    "venda[dataFinalizada]",
    "assinatura[data_assinatura]",
    "venda[dataInicio]",
  );
  const eventAt = eventAtRaw ? instante(eventAtRaw) : null;
  if (!accountKey || !saleCode || !eventCode || !productCode || !eventAt) {
    return { ok: false, code: "missing_required_field" };
  }

  const subscriptionCode = leitor("assinatura[codigo]");
  const saleStatus = primeiro(leitor, "codigo_status", "tipoEvento[codigo]") ?? eventCode;
  const webhookId = leitor("id") ?? idLegado([saleCode, saleStatus, eventAt, subscriptionCode ?? ""]);
  const regra = regraDoEvento(eventCode);

  return {
    ok: true,
    value: {
      accountKey,
      webhookId,
      saleCode,
      saleStatus,
      eventCode,
      eventKind: regra.kind,
      eventAt,
      installmentNumber: inteiroNaoNegativo(leitor("assinatura[parcela]")),
      productCode,
      subscriptionCode,
      planReference: primeiro(leitor, "plano[referencia]", "produtos[0][skuPlano]"),
      buyerEmail: leitor("comprador[email]")?.toLowerCase() ?? null,
      sourceReference: primeiro(leitor, "venda[src]", "src"),
      targetStatus: regra.targetStatus,
      paymentConfirmedAt: regra.paymentConfirmed ? eventAt : null,
    },
  };
}
