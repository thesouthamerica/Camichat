import { prisma } from '@/shared/database/prisma.js';
import { instagramClient } from '@/modules/instagram/instagram.client.js';
import {
  evaluateKeywordTrigger,
  KeywordTriggerConfig,
} from './nodes/keyword-trigger.node.js';
import {
  executeSendMessageNode,
  SendMessagePayload,
} from './nodes/send-message.node.js';
import {
  executeSmartDelayNode,
  SmartDelayPayload,
} from './nodes/smart-delay.node.js';
import {
  evaluateConditionAttributeNode,
  ConditionAttributePayload,
} from './nodes/condition-attribute.node.js';

// Palavras-chave universais para descadastro / LGPD
export const OPT_OUT_KEYWORDS = ['PARAR', 'CANCELAR', 'SAIR', 'STOP', 'UNSUBSCRIBE'];

export interface FlowExecutionParams {
  organizationId: string;
  instagramAccountId: string;
  contactId: string;
  igScopedId: string;
  userInput: string;
  isQuickReplyOrPostback?: boolean;
  accessToken: string;
  initialStepKey?: string;
  flowId?: string;
}

export class FlowExecutor {
  /**
   * Ponto de entrada principal para despacho de eventos de mensagens ou cliques.
   */
  async dispatch(params: FlowExecutionParams): Promise<void> {
    const {
      organizationId,
      instagramAccountId,
      contactId,
      igScopedId,
      userInput,
      accessToken,
    } = params;

    // 1. REGRA LGPD OBRIGATÓRIA: Detecção de Palavras-Chave de Descadastro
    const isOptOutAction = await this.handleOptOutKeywords({
      organizationId,
      instagramAccountId,
      contactId,
      igScopedId,
      userInput,
      accessToken,
    });

    if (isOptOutAction) {
      console.log(`[FlowExecutor] Descadastro executado para contato ${igScopedId}.`);
      return;
    }

    // 2. Busca fluxos ativos no tenant
    const flows = await prisma.flow.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { instagramAccountId },
          { instagramAccountId: null },
        ],
      },
      include: {
        steps: true,
      },
    });

    if (flows.length === 0) {
      console.log(`[FlowExecutor] Nenhum fluxo ativo encontrado para org ${organizationId}`);
      return;
    }

    // 3. Seleção do fluxo baseado em trigger
    let selectedFlow = null;
    let initialStepKey = params.initialStepKey;

    for (const flow of flows) {
      // Gatilho do tipo KEYWORD, COMMENT ou COMMENT_REPLY (comentário de publicação ou direct)
      if (flow.triggerType === 'KEYWORD' || flow.triggerType === 'COMMENT_REPLY' || (flow.triggerType as string) === 'COMMENT') {
        const config = (flow.triggerConfig ?? {}) as unknown as KeywordTriggerConfig;
        const matches = evaluateKeywordTrigger(userInput, config);
        if (matches) {
          selectedFlow = flow;
          initialStepKey = initialStepKey ?? flow.steps[0]?.stepKey ?? 'start';
          break;
        }
      }

      // Gatilho do tipo POSTBACK / Botão
      if (flow.triggerType === 'POSTBACK' && params.isQuickReplyOrPostback) {
        const matchingStep = flow.steps.find((s) => s.stepKey === userInput);
        if (matchingStep) {
          selectedFlow = flow;
          initialStepKey = matchingStep.stepKey;
          break;
        }
      }
    }

    // Se nenhum fluxo bateu, tenta DEFAULT_FALLBACK
    if (!selectedFlow) {
      const fallbackFlow = flows.find((f) => f.triggerType === 'DEFAULT_FALLBACK');
      if (fallbackFlow && fallbackFlow.steps.length > 0) {
        selectedFlow = fallbackFlow;
        initialStepKey = fallbackFlow.steps[0]?.stepKey ?? 'start';
      }
    }

    if (!selectedFlow || !initialStepKey) {
      console.log(`[FlowExecutor] Nenhuma regra disparada para "${userInput}".`);
      return;
    }

    // 4. Executa a Máquina de Estados no grafo de nós
    await this.runStateMachine({
      organizationId,
      instagramAccountId,
      contactId,
      igScopedId,
      flowId: selectedFlow.id,
      initialStepKey,
      userInput,
      accessToken,
    });
  }

  /**
   * Executa a Máquina de Estados que navega iterativamente pelos nós do fluxo.
   */
  async runStateMachine({
    organizationId,
    instagramAccountId,
    contactId,
    igScopedId,
    flowId,
    initialStepKey,
    userInput,
    accessToken,
  }: {
    organizationId: string;
    instagramAccountId: string;
    contactId: string;
    igScopedId: string;
    flowId: string;
    initialStepKey: string;
    userInput: string;
    accessToken: string;
  }): Promise<void> {
    const flow = await prisma.flow.findUnique({
      where: { id: flowId },
      include: { steps: true },
    });

    if (!flow || flow.steps.length === 0) {
      return;
    }

    const stepsMap = new Map(flow.steps.map((s) => [s.stepKey, s]));
    let currentStepKey: string | null = initialStepKey;
    let transitionsCount = 0;
    const MAX_TRANSITIONS = 25; // Prevenção de loop infinito em grafos cíclicos

    while (currentStepKey && transitionsCount < MAX_TRANSITIONS) {
      transitionsCount++;
      const currentStep = stepsMap.get(currentStepKey);

      if (!currentStep) {
        console.log(`[FlowExecutor] Passo "${currentStepKey}" não encontrado. Encerrando fluxo.`);
        break;
      }

      console.log(
        `[FlowExecutor] Executando nó [${currentStep.nodeType}] "${currentStep.stepKey}" no fluxo "${flow.name}"`
      );

      const nodeType = String(currentStep.nodeType).toLowerCase();

      // ------------------------------------------------------------------------
      // NÓ: trigger:keyword
      // ------------------------------------------------------------------------
      if (nodeType === 'trigger:keyword' || nodeType === 'keyword') {
        const payload = (currentStep.payload ?? {}) as unknown as KeywordTriggerConfig;
        const matches = evaluateKeywordTrigger(userInput, payload);

        if (!matches) {
          console.log(`[FlowExecutor] Palavra-chave não coincidiu no passo ${currentStep.stepKey}`);
          break;
        }

        currentStepKey = this.resolveNextRoute(currentStep.nextRoutes);
        continue;
      }

      // ------------------------------------------------------------------------
      // NÓ: action:send_message
      // ------------------------------------------------------------------------
      if (nodeType === 'action:send_message' || nodeType === 'message') {
        const payload = (currentStep.payload ?? {}) as unknown as SendMessagePayload;

        await executeSendMessageNode({
          organizationId,
          instagramAccountId,
          contactId,
          igScopedId,
          flowId,
          stepId: currentStep.id,
          payload,
          accessToken,
        });

        currentStepKey = this.resolveNextRoute(currentStep.nextRoutes);
        continue;
      }

      // ------------------------------------------------------------------------
      // NÓ: action:smart_delay
      // ------------------------------------------------------------------------
      if (nodeType === 'action:smart_delay' || nodeType === 'delay') {
        const payload = (currentStep.payload ?? {}) as unknown as SmartDelayPayload;
        const targetStepKey = payload.targetStepKey ?? this.resolveNextRoute(currentStep.nextRoutes);

        if (!targetStepKey) {
          console.warn(`[FlowExecutor] smart_delay sem próximo passo definido.`);
          break;
        }

        // Agenda no BullMQ e interrompe a execução síncrona atual
        await executeSmartDelayNode({
          organizationId,
          instagramAccountId,
          contactId,
          igScopedId,
          flowId,
          payload: {
            ...payload,
            targetStepKey,
          },
          accessToken,
        });

        // Interrompe loop para aguardar o disparo assíncrono do BullMQ
        break;
      }

      // ------------------------------------------------------------------------
      // NÓ: condition:attribute
      // ------------------------------------------------------------------------
      if (nodeType === 'condition:attribute' || nodeType === 'condition') {
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
        });

        if (!contact) {
          console.warn(`[FlowExecutor] Contato ${contactId} não encontrado para validação de atributos`);
          break;
        }

        const payload = (currentStep.payload ?? {}) as unknown as ConditionAttributePayload;
        const result = evaluateConditionAttributeNode(contact, payload);

        console.log(
          `[FlowExecutor] Condição avaliada: ${result.result ? 'VERDADEIRO' : 'FALSO'} -> Próximo: ${result.nextStepKey}`
        );

        currentStepKey = result.nextStepKey ?? null;
        continue;
      }

      // Nó desconhecido: tenta rota padrão
      currentStepKey = this.resolveNextRoute(currentStep.nextRoutes);
    }
  }

  /**
   * Trata palavras-chave de descadastro (LGPD: "PARAR", "CANCELAR", "SAIR").
   */
  private async handleOptOutKeywords({
    organizationId,
    instagramAccountId,
    contactId,
    igScopedId,
    userInput,
    accessToken,
  }: {
    organizationId: string;
    instagramAccountId: string;
    contactId: string;
    igScopedId: string;
    userInput: string;
    accessToken: string;
  }): Promise<boolean> {
    const cleanInput = userInput.trim().toUpperCase();

    if (!OPT_OUT_KEYWORDS.includes(cleanInput)) {
      return false;
    }

    // 1. Atualiza contato para opt_out = true
    await prisma.contact.update({
      where: { id: contactId },
      data: { optOut: true },
    });

    const confirmationText =
      'Você foi descadastrado com sucesso e não receberá mais mensagens automáticas. Para reativar seu atendimento a qualquer momento, envie "INICIAR".';

    // 2. Dispara confirmação via InstagramClient
    try {
      const response = await instagramClient.sendTextMessage(
        igScopedId,
        confirmationText,
        accessToken
      );

      // 3. Salva no ConversationLog
      await prisma.conversationLog.create({
        data: {
          organizationId,
          instagramAccountId,
          contactId,
          mid: response.message_id,
          direction: 'OUT',
          content: confirmationText,
          status: 'SENT',
        },
      });
    } catch (err) {
      console.error(`[FlowExecutor] Falha ao enviar confirmação de descadastro para ${igScopedId}:`, err);
    }

    return true;
  }

  /**
   * Helper para extrair a próxima rota da propriedade nextRoutes.
   */
  private resolveNextRoute(nextRoutes: unknown): string | null {
    if (!nextRoutes) return null;

    if (typeof nextRoutes === 'string') {
      return nextRoutes;
    }

    if (Array.isArray(nextRoutes)) {
      if (nextRoutes.length === 0) return null;
      const first = nextRoutes[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first !== null && 'targetStepKey' in first) {
        return (first as { targetStepKey: string }).targetStepKey;
      }
      if (typeof first === 'object' && first !== null && 'target' in first) {
        return (first as { target: string }).target;
      }
    }

    if (typeof nextRoutes === 'object') {
      const obj = nextRoutes as Record<string, unknown>;
      if (typeof obj.default === 'string') return obj.default;
      if (typeof obj.next === 'string') return obj.next;
      if (typeof obj.targetStepKey === 'string') return obj.targetStepKey;
    }

    return null;
  }
}

export const flowExecutor = new FlowExecutor();
