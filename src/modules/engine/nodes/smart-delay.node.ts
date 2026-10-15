import crypto from 'node:crypto';
import { flowDelayQueue, FlowDelayedJobData } from '@/config/redis.js';

export interface SmartDelayPayload {
  minutes?: number;
  seconds?: number;
  targetStepKey: string;
}

export interface ExecuteSmartDelayParams {
  organizationId: string;
  instagramAccountId: string;
  contactId: string;
  igScopedId: string;
  flowId: string;
  payload: SmartDelayPayload;
  accessToken: string;
}

/**
 * Executa o nó action:smart_delay agendando o próximo nó de fluxo no BullMQ com delay em milissegundos.
 */
export async function executeSmartDelayNode({
  organizationId,
  instagramAccountId,
  contactId,
  igScopedId,
  flowId,
  payload,
  accessToken,
}: ExecuteSmartDelayParams): Promise<{ scheduled: boolean; delayMs: number; targetStepKey: string }> {
  const { minutes = 1, seconds, targetStepKey } = payload;

  if (!targetStepKey) {
    throw new Error('Nó action:smart_delay requer targetStepKey definido para continuar o fluxo');
  }

  // Calcula atraso em milissegundos
  const delayMs = seconds !== undefined ? seconds * 1000 : Math.max(minutes, 0.1) * 60 * 1000;
  const jobId = crypto.randomUUID();

  const jobData: FlowDelayedJobData = {
    organizationId,
    instagramAccountId,
    contactId,
    igScopedId,
    flowId,
    targetStepKey,
    accessToken,
  };

  await flowDelayQueue.add('delayed-step', jobData, {
    jobId,
    delay: delayMs,
  });

  console.log(
    `[SmartDelay] Nó agendado para executar em ${delayMs}ms (${minutes}min) para o contato ${igScopedId} -> Próximo passo: ${targetStepKey}`
  );

  return { scheduled: true, delayMs, targetStepKey };
}
