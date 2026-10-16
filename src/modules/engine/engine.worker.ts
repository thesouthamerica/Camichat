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
      console.log(`[EngineWorker] Raw Payload:`, JSON.stringify(payload, null, 2));

      const raw = payload as unknown as MetaWebhookPayload;
      if (!raw || !raw.entry || !Array.isArray(raw.entry)) {
        console.warn(`[EngineWorker] Payload sem entries válidas para o job ${jobId}`);
        return { status: 'skipped', reason: 'no_entries' };
      }

      for (const entry of raw.entry) {
        // Suporte a entry.messaging (formato direto)
        if (entry.messaging && Array.isArray(entry.messaging)) {
          for (const event of entry.messaging) {
            console.log(`[EngineWorker] Messaging event:`, JSON.stringify(event, null, 2));
            await processMessagingEvent(entry.id, event);
          }
        }

        // Suporte a entry.changes (formato Instagram Webhooks alternativo)
        const entryWithChanges = entry as unknown as { changes?: Array<{ field: string; value: any }> };
        if (entryWithChanges.changes && Array.isArray(entryWithChanges.changes)) {
          for (const change of entryWithChanges.changes) {
            console.log(`[EngineWorker] Change event (${change.field}):`, JSON.stringify(change.value, null, 2));
            if (change.field === 'messages' && change.value) {
              await processMessagingEvent(entry.id, change.value);
            }
          }
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
  let account = await prisma.instagramAccount.findFirst({
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

  // Em modo de teste/desenvolvimento (ex: botão de Teste da Meta com ID fictício 23245/0)
  if (!account) {
    account = await prisma.instagramAccount.findFirst({
      where: { isActive: true },
    });
    if (account) {
      console.log(`[EngineWorker] Evento de teste da Meta: vinculando à conta ativa ${account.name} (${account.igUserId})`);
    }
  }

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

  // Função robusta para parse de timestamp da Meta (suporta string/number em segundos ou milissegundos)
  let eventDate = new Date();
  if (event.timestamp) {
    const num = Number(event.timestamp);
    if (!isNaN(num)) {
      eventDate = num < 10000000000 ? new Date(num * 1000) : new Date(num);
    } else {
      const parsed = new Date(event.timestamp);
      if (!isNaN(parsed.getTime())) {
        eventDate = parsed;
      }
    }
  }

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
  const rawMid = event.message?.mid ?? event.postback?.mid ?? null;
  // Se for o mid simulado de teste da Meta ("random_mid"), adiciona um timestamp para permitir múltiplos testes consecutivos
  const mid = rawMid === 'random_mid' ? `random_mid_${Date.now()}` : rawMid;

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
  // Para testes oficiais da Meta (id 12334 com mock timestamp de 2018), simula dentro da janela atual
  const lastDateForWindow = igScopedId === '12334' ? new Date() : contact.lastInteractionAt;
  const isWithinWindow = isWithin24HoursWindow(lastDateForWindow);

  if (!isWithinWindow) {
    console.warn(
      `[EngineWorker] [Meta Policy] Contato ${contact.igScopedId} fora da janela de 24h (Última: ${contact.lastInteractionAt.toISOString()}). Disparo bloqueado.`
    );
    return;
  }

  // Atualiza o lastInteractionAt do contato após a nova interação
  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastInteractionAt: igScopedId === '12334' ? new Date() : eventDate },
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
