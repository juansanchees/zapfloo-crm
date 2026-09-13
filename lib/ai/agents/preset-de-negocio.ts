/**
 * Presets de negócio para o editor de agentes.
 *
 * Um preset aponta para um pacote já governado pelo catálogo. Ele não mantém
 * uma segunda lista de ferramentas: assim, uma capacidade nova ou removida do
 * pacote canônico não deixa o botão de clínica envelhecer em silêncio.
 */
import type { ToolBundle } from "@/lib/mcp/tools/pacotes";
import {
  ligarPacote,
  type CapacidadeSelecionavel,
} from "@/lib/mcp/tools/selecao-por-pacote";

export type TipoDeNegocioComPreset = "clinica";

export const PACOTE_POR_TIPO_DE_NEGOCIO = {
  clinica: "vender",
} as const satisfies Record<TipoDeNegocioComPreset, ToolBundle>;

export function aplicarPresetDeNegocio(
  selecionadas: ReadonlyArray<string>,
  catalogo: ReadonlyArray<CapacidadeSelecionavel>,
  tipo: TipoDeNegocioComPreset,
): string[] {
  return ligarPacote(selecionadas, catalogo, PACOTE_POR_TIPO_DE_NEGOCIO[tipo]);
}

