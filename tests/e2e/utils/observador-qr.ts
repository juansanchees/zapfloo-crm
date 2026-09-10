import type { Locator } from "@playwright/test";

type OpcoesDoObservadorQr = {
  qr: Locator;
  arquivo: string;
  aoCapturar: () => void;
  intervaloMs?: number;
  timeoutDaOperacaoMs?: number;
};

type ObservadorQr = {
  encerrar: () => Promise<void>;
};

async function esperarOuAbortar(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const concluir = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", concluir);
      resolve();
    };
    const timer = setTimeout(concluir, ms);
    signal.addEventListener("abort", concluir, { once: true });
  });
}

export async function iniciarObservadorQr({
  qr,
  arquivo,
  aoCapturar,
  intervaloMs = 1_000,
  timeoutDaOperacaoMs = 2_000,
}: OpcoesDoObservadorQr): Promise<ObservadorQr> {
  const controle = new AbortController();
  const opcoes = { signal: controle.signal, timeout: timeoutDaOperacaoMs };

  await qr.screenshot({ path: arquivo, ...opcoes });
  aoCapturar();
  let ultimaFonte = await qr.getAttribute("src", opcoes);

  const conclusao = (async () => {
    while (!controle.signal.aborted) {
      await esperarOuAbortar(intervaloMs, controle.signal);
      if (controle.signal.aborted) break;
      try {
        const fonte = await qr.getAttribute("src", opcoes);
        const carregado = await qr.evaluate(
          (imagem: HTMLImageElement) => imagem.complete && imagem.naturalWidth > 0,
          undefined,
          opcoes,
        );
        if (fonte && fonte !== ultimaFonte && carregado) {
          await qr.screenshot({ path: arquivo, ...opcoes });
          ultimaFonte = fonte;
          aoCapturar();
        }
      } catch {
        if (controle.signal.aborted) break;
        // A imagem pode sumir entre leituras ou enquanto o transporte está FAILED.
      }
    }
  })();

  return {
    encerrar: async () => {
      controle.abort();
      await conclusao;
    },
  };
}
