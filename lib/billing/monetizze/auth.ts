import { createHash, timingSafeEqual } from "node:crypto";

function resumo(valor: string): Buffer {
  return createHash("sha256").update(valor, "utf8").digest();
}

/** Compara a chave da conta sem depender do comprimento informado pelo remetente. */
export function validarChaveUnicaMonetizze(recebida: string, esperada: string): boolean {
  if (!recebida || !esperada) return false;
  return timingSafeEqual(resumo(recebida), resumo(esperada));
}
