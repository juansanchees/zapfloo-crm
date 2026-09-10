import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export interface ArquivoTemporarioPrivado {
  diretorio: string;
  arquivo: string;
  limpar: () => void;
}

/** Cria o único artefato escaneável fora do repo, com permissões explícitas. */
export function criarArquivoTemporarioPrivado(nome: string): ArquivoTemporarioPrivado {
  if (basename(nome) !== nome) throw new Error("Nome inválido para artefato temporário privado.");
  const diretorio = mkdtempSync(join(tmpdir(), "zapfloo-fresh-"));
  try {
    chmodSync(diretorio, 0o700);
    const arquivo = join(diretorio, nome);
    // O placeholder garante 0600 antes de a primeira captura começar. O
    // screenshot trunca este mesmo inode, em vez de criar um arquivo aberto.
    writeFileSync(arquivo, "", { flag: "wx", mode: 0o600 });
    chmodSync(arquivo, 0o600);
    return {
      diretorio,
      arquivo,
      limpar: () => rmSync(diretorio, { recursive: true, force: true }),
    };
  } catch (erro) {
    rmSync(diretorio, { recursive: true, force: true });
    throw erro;
  }
}

type ResultadoDeCleanup = { error: unknown };

/** Tenta todas as limpezas e agrega só a contagem, nunca detalhes do erro. */
export async function exigirCleanupCompleto(
  operacoes: ReadonlyArray<() => PromiseLike<ResultadoDeCleanup>>,
): Promise<void> {
  let falhas = 0;
  for (const operacao of operacoes) {
    try {
      const resultado = await operacao();
      if (resultado.error) falhas += 1;
    } catch {
      falhas += 1;
    }
  }
  if (falhas > 0) {
    throw new Error(`Cleanup da fixture local falhou em ${falhas} operação(ões).`);
  }
}
