import type { ChannelAdapter } from '../channel-adapter';
import type { Logger } from '../obs/logger';

export const TETO_DIGITANDO_MS = 25_000;

/**
 * Mantém a presença somente enquanto o turno decide/envia a resposta.
 * A parada roda no sucesso, no erro e também por teto, para nunca deixar o
 * WhatsApp exibindo “digitando…” preso quando um provedor trava.
 */
export async function comPresencaDeDigitacao<T>(
  channel: ChannelAdapter,
  input: { conversationId: string; channelSessionId: string },
  executar: () => Promise<T>,
  opts: { log: Logger; tetoMs?: number },
): Promise<T> {
  if (channel.setTyping === undefined) return executar();

  const setTyping = channel.setTyping.bind(channel);
  const alterar = async (active: boolean): Promise<void> => {
    try {
      await setTyping({ ...input, active });
    } catch (err) {
      opts.log.warn('presença de digitação falhou (turno continua)', {
        active,
        error: err instanceof Error ? err.message.slice(0, 120) : 'desconhecido',
      });
    }
  };

  await alterar(true);
  let parada: Promise<void> | null = null;
  const parar = (): Promise<void> => {
    parada ??= alterar(false);
    return parada;
  };
  const timer = setTimeout(() => void parar(), opts.tetoMs ?? TETO_DIGITANDO_MS);
  timer.unref?.();
  try {
    return await executar();
  } finally {
    clearTimeout(timer);
    await parar();
  }
}
