import { prisma } from '@/shared/database/prisma.js';
import { instagramClient, QuickReplyButton } from '@/modules/instagram/instagram.client.js';

export interface SendMessagePayload {
  text: string;
  buttons?: QuickReplyButton[];
}

export interface ExecuteSendMessageParams {
  organizationId: string;
  instagramAccountId: string;
  contactId: string;
  igScopedId: string;
  flowId?: string;
  stepId?: string;
  payload: SendMessagePayload;
  accessToken: string;
}

/**
 * Executa o nó action:send_message disparando texto ou respostas rápidas para o Instagram.
 * Salva a mensagem enviada na tabela ConversationLog com status SENT ou FAILED.
 */
export async function executeSendMessageNode({
  organizationId,
  instagramAccountId,
  contactId,
  igScopedId,
  flowId,
  stepId,
  payload,
  accessToken,
}: ExecuteSendMessageParams): Promise<{ messageId: string }> {
  const { text, buttons } = payload;

  try {
    let messageId = '';

    if (buttons && buttons.length > 0) {
      const response = await instagramClient.sendQuickReplies(
        igScopedId,
        text,
        buttons,
        accessToken
      );
      messageId = response.message_id;
    } else {
      const response = await instagramClient.sendTextMessage(
        igScopedId,
        text,
        accessToken
      );
      messageId = response.message_id;
    }

    // Registra mensagem enviada na tabela ConversationLog (OUT)
    await prisma.conversationLog.create({
      data: {
        organizationId,
        instagramAccountId,
        contactId,
        flowId,
        flowStepId: stepId,
        mid: messageId,
        direction: 'OUT',
        content: text,
        rawPayload: { buttons: buttons ?? [] } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        status: 'SENT',
      },
    });

    return { messageId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Registra falha de envio para auditoria
    await prisma.conversationLog.create({
      data: {
        organizationId,
        instagramAccountId,
        contactId,
        flowId,
        flowStepId: stepId,
        direction: 'OUT',
        content: text,
        status: 'FAILED',
        errorMessage: errorMsg,
      },
    });

    throw error;
  }
}
