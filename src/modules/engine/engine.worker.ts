import { Worker, Job } from 'bullmq';
import {
  redisConfig,
  INSTAGRAM_WEBHOOKS_QUEUE_NAME,
  InstagramWebhookJobData,
} from '@/config/redis.js';
import { prisma } from '@/shared/database/prisma.js';
import { decryptToken } from '@/shared/utils/crypto.js';
import { flowExecutor } from './flow-executor.js';

// ==============================================================================
// TIPOS DO PAYLOAD DA META GRAPH API
// ==============================================================================

interface MetaWebhookMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    quick_reply?: {
      payload: string;
    };
  };
  postback?: {
    mid: string;
    title: string;
    payload: string;
  };
}

interface MetaWebhookEntry {
  id: string; // ID da Página / Instagram Business Account
  time: number;
  messaging?: MetaWebhookMessagingEvent[];
}

interface MetaWebhookPayload {
  object: string;
  entry?: MetaWebhookEntry[];
}

/**
 * Validador da janela de 24 horas da Meta.
 * Retorna true se a última interação do contato ocorreu há menos de 24 horas.
 */
export function isWithin24HoursWindow(lastInteractionAt: Date): boolean {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const elapsedMs = Date.now() - new Date(lastInteractionAt).getTime();
  return elapsedMs <= TWENTY_FOUR_HOURS_MS;
}

// ==============================================================================
// WORKER BULLMQ DE PROCESSAMENTO
// ==============================================================================

export function createEngineWorker(): Worker<InstagramWebhookJobData> {
  const worker = new Worker<InstagramWebhookJobData>(
    INSTAGRAM_WEBHOOKS_QUEUE_NAME,
    async (job: Job<InstagramWebhookJobData>) => {
      const { jobId, receivedAt, payload } = job.data;
      console.log(`[EngineWorker] Processando job ${jobId} (Recebido em: ${receivedAt})`);

      const raw = payload as unknown as MetaWebhookPayload;
      if (!raw || !raw.entry || !Array.isArray(raw.entry)) {
        console.warn(`[EngineWorker] Payload sem entries válidas para o job ${jobId}`);
        return { status: 'skipped', reason: 'no_entries' };
      }

      for (const entry of raw.entry) {
        if (!entry.messaging || !Array.isArray(entry.messaging)) {
          continue;
        }

        for (const event of entry.messaging) {
          await processMessagingEvent(entry.id, event);
        }
      }

      return { status: 'completed', jobId };
    },
    {
      connection: redisConfig,
      concurrency: 10,
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ [EngineWorker] Job ${job.id} concluído com sucesso`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [EngineWorker] Falha no job ${job?.id}: ${err.message}`);
  });

  return worker;
}

/**
 * Processa um evento individual de mensagem recebida do Instagram.
 */
async function processMessagingEvent(
  entryId: string,
  event: MetaWebhookMessagingEvent
): Promise<void> {
  const igScopedId = event.sender?.id;
  const recipientId = event.recipient?.id;

  if (!igScopedId || !recipientId) {
    console.warn('[EngineWorker] Evento ignorado: sender ou recipient ausente.');
    return;
  }

  // 1. Localiza a conta do Instagram conectada
  const account = await prisma.instagramAccount.findFirst({
    where: {
      OR: [
        { igUserId: entryId },
        { pageId: entryId },
        { igUserId: recipientId },
        { pageId: recipientId },
      ],
      isActive: true,
    },
  });

  if (!account) {
    console.warn(
      `[EngineWorker] Nenhuma conta ativa do Instagram encontrada para entryId: ${entryId} ou recipient: ${recipientId}`
    );
    return;
  }

  const organizationId = account.organizationId;

  // 2. Localiza ou cria o Contato no tenant da organização
  let contact = await prisma.contact.findUnique({
    where: {
      org_contact_scoped_unique: {
        organizationId,
        igScopedId,
      },
    },
  });

  const eventDate = new Date(event.timestamp || Date.now());

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        organizationId,
        instagramAccountId: account.id,
        igScopedId,
        lastInteractionAt: eventDate,
        optOut: false,
      },
    });
  }

  // 3. REGRA LGPD: Verificação de Opt-out
  if (contact.optOut) {
    console.warn(
      `[EngineWorker] [LGPD] Contato ${contact.igScopedId} possui opt_out=true. Abortando qualquer resposta ou automação imediatamente.`
    );
    return;
  }

  // 4. Extrai a entrada do usuário (texto ou clique de botão)
  const incomingText = event.message?.text;
  const quickReplyPayload = event.message?.quick_reply?.payload;
  const postbackPayload = event.postback?.payload;

  const userInput = quickReplyPayload ?? postbackPayload ?? incomingText;
  const isButtonAction = Boolean(quickReplyPayload || postbackPayload);

  // Se não houver mensagem de texto nem ação de botão (ex: entrega, leitura), ignora
  if (!userInput) {
    console.log(`[EngineWorker] Evento sem texto ou clique de botão de ${igScopedId}. Finalizado.`);
    return;
  }

  // 5. Registra a mensagem de entrada no log auditável (IN)
  const mid = event.message?.mid ?? event.postback?.mid ?? null;
  await prisma.conversationLog.create({
    data: {
      organizationId,
      instagramAccountId: account.id,
      contactId: contact.id,
      mid,
      direction: 'IN',
      content: userInput,
      rawPayload: event as unknown as import('@prisma/client').Prisma.InputJsonValue,
      status: 'DELIVERED',
      timestamp: eventDate,
    },
  });

  // 6. REGRA META: Verificação da Janela de 24 horas antes de qualquer disparo
  // Compara o lastInteractionAt anterior do contato
  const isWithinWindow = isWithin24HoursWindow(contact.lastInteractionAt);
  if (!isWithinWindow) {
    console.warn(
      `[EngineWorker] [Meta Policy] Contato ${contact.igScopedId} fora da janela de 24h (Última: ${contact.lastInteractionAt.toISOString()}). Disparo bloqueado.`
    );
    return;
  }

  // Atualiza o lastInteractionAt do contato após a nova interação
  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastInteractionAt: eventDate },
  });

  // 7. Decifra o Access Token da conta usando AES-256-GCM
  const accessToken = decryptToken({
    encrypted: account.accessTokenEncrypted,
    iv: account.accessTokenIv,
    authTag: account.accessTokenTag,
  });

  // 8. Despacha para o motor de execução de fluxos
  await flowExecutor.dispatch({
    organizationId,
    instagramAccountId: account.id,
    contactId: contact.id,
    igScopedId,
    userInput,
    isQuickReplyOrPostback: isButtonAction,
    accessToken,
  });
}
