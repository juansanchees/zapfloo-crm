/**
 * Resposta determinística quando um áudio chegou, mas a transcrição terminou
 * em falha. Não se pede ao modelo que improvise: a mesma cadeia de guardrails
 * e o mesmo adapter do turno enviam uma frase curta, idempotente e segura.
 */
import type pg from 'pg';

import type { LeadContext } from '../edge/crm/get-lead-context';
import type { ChannelAdapter } from '../channel-adapter';
import type { Logger } from '../obs/logger';
import type { LgpdInput } from '../guardrails/lgpd/legal-basis';
import { runBeforeSend } from '../guardrails/before-send';

export const TEXTO_AUDIO_ILEGIVEL =
  'Não consegui ouvir este áudio. Por favor, escreva a mensagem ou envie o áudio novamente.';

export function ultimoInboundEhAudioComFalha(context: LeadContext): boolean {
  const ultima = [...context.messages].reverse().find((mensagem) => mensagem.direction === 'inbound');
  return ultima?.type === 'audio' && ultima.media_derived_status === 'failed';
}

export async function avisarAudioIlegivel(
  pool: pg.Pool,
  ids: {
    tenantId: string;
    leadId: string;
    conversationId: string;
    channelSessionId: string;
    jobId: string;
  },
  opts: {
    channel: ChannelAdapter;
    optedOutThisTurn: boolean;
    now: Date;
    log: Logger;
    lgpd?: LgpdInput;
    agentId?: string | null;
    disclosureMode?: 'inject' | 'veto';
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<void> {
  const chain = await runBeforeSend({
    pool,
    log: opts.log,
    tenantId: ids.tenantId,
    leadId: ids.leadId,
    jobId: ids.jobId,
    channelSessionId: ids.channelSessionId,
    body: TEXTO_AUDIO_ILEGIVEL,
    optedOutThisTurn: opts.optedOutThisTurn,
    enforceSpinning: false,
    crmDailyLimit: null,
    now: opts.now,
    ...(opts.sleep !== undefined ? { sleep: opts.sleep } : {}),
    ...(opts.lgpd !== undefined ? { lgpd: opts.lgpd } : {}),
    ...(opts.agentId !== undefined ? { agentId: opts.agentId } : {}),
    ...(opts.disclosureMode !== undefined ? { disclosureMode: opts.disclosureMode } : {}),
    send: (body) =>
      opts.channel.send({
        tenantId: ids.tenantId,
        leadId: ids.leadId,
        jobId: ids.jobId,
        seq: 0,
        conversationId: ids.conversationId,
        body,
      }),
  });

  if (chain.status === 'vetoed') {
    opts.log.info('aviso de áudio ilegível vetado pela cadeia', { code: chain.code });
    return;
  }
  if (chain.outcome.kind === 'failed' || chain.outcome.kind === 'unavailable') {
    throw new Error('aviso de áudio ilegível não aceito pelo canal — tentar novamente');
  }
}
