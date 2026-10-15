import { Worker, Job } from 'bullmq';
import {
  redisConfig,
  FLOW_DELAY_QUEUE_NAME,
  FlowDelayedJobData,
} from '@/config/redis.js';
import { prisma } from '@/shared/database/prisma.js';
import { flowExecutor } from './flow-executor.js';
import { isWithin24HoursWindow } from './engine.worker.js';

/**
 * Worker do BullMQ responsável por retomar a execução do grafo de nós após um atraso inteligente (action:smart_delay).
 */
export function createFlowDelayedWorker(): Worker<FlowDelayedJobData> {
  const worker = new Worker<FlowDelayedJobData>(
    FLOW_DELAY_QUEUE_NAME,
    async (job: Job<FlowDelayedJobData>) => {
      const {
        organizationId,
        instagramAccountId,
        contactId,
        igScopedId,
        flowId,
        targetStepKey,
        accessToken,
      } = job.data;

      console.log(
        `[FlowDelayedWorker] Retomando fluxo ${flowId} no passo "${targetStepKey}" para contato ${igScopedId}`
      );

      // 1. Verifica se o contato efetuou opt-out durante o período de delay (LGPD)
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
      });

      if (!contact || contact.optOut) {
        console.warn(
          `[FlowDelayedWorker] Execução atrasada abortada: contato inexistente ou com opt_out=true.`
        );
        return { status: 'aborted', reason: 'opt_out_or_missing' };
      }

      // 2. Valida a janela regulatória de 24 horas da Meta
      if (!isWithin24HoursWindow(contact.lastInteractionAt)) {
        console.warn(
          `[FlowDelayedWorker] Execução atrasada abortada: fora da janela de 24h da Meta para ${igScopedId}.`
        );
        return { status: 'aborted', reason: 'outside_24h_window' };
      }

      // 3. Executa a máquina de estados a partir do nó alvo agendado
      await flowExecutor.runStateMachine({
        organizationId,
        instagramAccountId,
        contactId,
        igScopedId,
        flowId,
        initialStepKey: targetStepKey,
        userInput: '',
        accessToken,
      });

      return { status: 'completed', targetStepKey };
    },
    {
      connection: redisConfig,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ [FlowDelayedWorker] Job ${job.id} executado com sucesso`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [FlowDelayedWorker] Erro no job ${job?.id}: ${err.message}`);
  });

  return worker;
}
