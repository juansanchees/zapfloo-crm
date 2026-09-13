import { z } from "zod";

/** Contrato único do JSON da fonte: leitor, revisão e worker não adivinham paths. */
export const estadoDoSiteSchema = z.object({
  url: z.string().url(),
  resumo: z.string().default(""),
  paginasLidas: z.number().int().nonnegative().default(0),
  limiteAtingido: z.boolean().default(false),
  recusas: z
    .array(
      z.object({
        url: z.string(),
        linha: z.number().int().nonnegative(),
        motivo: z.string(),
        item: z.string().optional(),
      }),
    )
    .default([]),
  motivo: z.string().optional(),
  tentativas: z.number().int().nonnegative().default(0),
  inicio: z.string().datetime().nullable().default(null),
  concluidaEm: z.string().datetime().nullable().default(null),
  revisadoEm: z.string().datetime().optional(),
  revisadoPor: z.string().uuid().optional(),
  revisaoConteudoHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  revisaoToken: z.string().uuid().optional(),
  revisaoInicio: z.string().datetime().optional(),
  produtos: z.number().int().nonnegative().optional(),
  perguntas: z.number().int().nonnegative().optional(),
});

export type EstadoDoSite = z.infer<typeof estadoDoSiteSchema>;

/** Material legado/incompleto não derruba a biblioteca nem ganha aprovação implícita. */
export function lerEstadoDoSite(metadata: unknown): EstadoDoSite | null {
  const parsed = z.object({ site: estadoDoSiteSchema }).safeParse(metadata);
  return parsed.success ? parsed.data.site : null;
}

export function siteFoiRevisado(metadata: unknown): boolean {
  const estado = lerEstadoDoSite(metadata);
  return Boolean(
    estado?.concluidaEm && estado.revisadoEm && estado.revisadoPor && estado.revisaoConteudoHash,
  );
}

/** Um processo encerrado no meio da edição não prende o material para sempre. */
export const LEASE_REVISAO_SITE_MS = 2 * 60 * 1_000;
export function revisaoDoSiteExpirou(estado: EstadoDoSite | null, agora = Date.now()): boolean {
  return Boolean(
    estado?.revisaoToken &&
    estado.revisaoInicio &&
    agora - Date.parse(estado.revisaoInicio) >= LEASE_REVISAO_SITE_MS,
  );
}
