import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";

export type SiteNormalizado = { ok: true; url: string | null } | { ok: false; motivo: string };

/** Pura e compartilhada pela tela/action; o guard textual já é client-safe. */
export function normalizarSiteDoNegocio(bruto: string): SiteNormalizado {
  const valor = bruto.trim();
  if (!valor) return { ok: true, url: null };
  if (valor.length > 2_000) return { ok: false, motivo: "site_url_invalida" };
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(valor) ? valor : `https://${valor}`);
    if (url.username || url.password) return { ok: false, motivo: "site_url_com_credencial" };
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      ["instagram.com", "facebook.com"].some(
        (social) => host === social || host.endsWith(`.${social}`),
      )
    ) {
      return { ok: false, motivo: "site_rede_social" };
    }
    // Reutiliza a regra de egress, inclusive https obrigatório em produção.
    // A segunda camada (DNS) pertence só ao leitor, antes de cada requisição.
    assertSafeOutboundUrl(url.href);
    url.hash = "";
    return { ok: true, url: url.href };
  } catch {
    return { ok: false, motivo: "site_url_insegura" };
  }
}
