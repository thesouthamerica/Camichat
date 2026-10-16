import axios, { AxiosInstance, AxiosError } from 'axios';

// ==============================================================================
// TIPOS E INTERFACES
// ==============================================================================

export interface QuickReplyButton {
  content_type?: 'text';
  title: string;
  payload: string;
}

export interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

interface MetaErrorResponseData {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ==============================================================================
// HIERARQUIA DE ERROS DA META GRAPH API
// ==============================================================================

export class MetaGraphApiError extends Error {
  public readonly code: number;
  public readonly subcode?: number;
  public readonly type: string;
  public readonly fbtraceId?: string;

  constructor(
    message: string,
    code: number,
    subcode?: number,
    type = 'MetaGraphApiError',
    fbtraceId?: string
  ) {
    super(message);
    this.name = 'MetaGraphApiError';
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Erro 190: Access Token Inválido, revogado ou expirado.
 */
export class MetaTokenExpiredError extends MetaGraphApiError {
  constructor(message: string, subcode?: number, fbtraceId?: string) {
    super(
      `[Meta Error 190] Token inválido ou expirado: ${message}`,
      190,
      subcode,
      'OAuthException',
      fbtraceId
    );
    this.name = 'MetaTokenExpiredError';
  }
}

/**
 * Erro 10: Mensagem fora da janela de atendimento de 24 horas da Meta.
 */
export class MetaOutside24hWindowError extends MetaGraphApiError {
  constructor(message: string, subcode?: number, fbtraceId?: string) {
    super(
      `[Meta Error 10] Fora da janela de 24 horas permitida: ${message}`,
      10,
      subcode,
      'PolicyException',
      fbtraceId
    );
    this.name = 'MetaOutside24hWindowError';
  }
}

/**
 * Erro 4 / 17 / 32 / 613: Rate Limit da Meta Graph API.
 */
export class MetaRateLimitError extends MetaGraphApiError {
  constructor(message: string, code = 4, subcode?: number, fbtraceId?: string) {
    super(
      `[Meta Rate Limit - Error ${code}] Limite de requisições excedido: ${message}`,
      code,
      subcode,
      'RateLimitException',
      fbtraceId
    );
    this.name = 'MetaRateLimitError';
  }
}

// ==============================================================================
// CLIENTE HTTP DO INSTAGRAM (GRAPH API v21.0)
// ==============================================================================

export class InstagramClient {
  private readonly defaultApiVersion = 'v26.0';

  /**
   * Determina a URL base adequada com base no tipo de token (Instagram User Token vs Facebook Page Token)
   */
  private getBaseUrl(accessToken: string): string {
    // Tokens iniciados em IGAA... ou IGQV... pertencem ao endpoint oficial do Instagram Graph API
    if (accessToken.startsWith('IGAA') || accessToken.startsWith('IG')) {
      return `https://graph.instagram.com/${this.defaultApiVersion}`;
    }
    return `https://graph.facebook.com/v21.0`;
  }

  /**
   * Envia uma mensagem de texto simples via Instagram Direct.
   */
  async sendTextMessage(
    recipientId: string,
    text: string,
    accessToken: string
  ): Promise<SendMessageResponse> {
    const payload = {
      recipient: { id: recipientId },
      message: { text },
    };

    return this.postWithRetry<SendMessageResponse>('/me/messages', payload, accessToken);
  }

  /**
   * Envia uma resposta privada (Private Reply via Direct) para um comentário em post do Instagram.
   * Utiliza recipient.comment_id oficial da Meta Graph API para vincular diretamente à postagem.
   */
  async sendCommentPrivateReply(
    commentId: string,
    recipientId: string,
    text: string,
    accessToken: string
  ): Promise<SendMessageResponse> {
    try {
      // 1. Tenta envio com recipient.comment_id (padrão oficial para comentários da Meta)
      const payload = {
        recipient: { comment_id: commentId },
        message: { text },
      };
      return await this.postWithRetry<SendMessageResponse>('/me/messages', payload, accessToken);
    } catch (err: any) {
      console.warn(
        `[InstagramClient] Falha com comment_id (${err.message}). Tentando fallback com recipient.id ${recipientId}...`
      );
      // 2. Fallback com recipient.id
      return await this.sendTextMessage(recipientId, text, accessToken);
    }
  }

  /**
   * Envia uma mensagem com botões de resposta rápida (Quick Replies).
   */
  async sendQuickReplies(
    recipientId: string,
    text: string,
    buttons: QuickReplyButton[],
    accessToken: string
  ): Promise<SendMessageResponse> {
    const payload = {
      recipient: { id: recipientId },
      message: {
        text,
        quick_replies: buttons.map((b) => ({
          content_type: b.content_type ?? 'text',
          title: b.title,
          payload: b.payload,
        })),
      },
    };

    return this.postWithRetry<SendMessageResponse>('/me/messages', payload, accessToken);
  }

  /**
   * Executa requisição POST com tratamento estrito dos códigos de erro da Meta
   * e retentativa com backoff exponencial específico para Rate Limit (Erro 4).
   */
  private async postWithRetry<T>(
    endpoint: string,
    data: Record<string, unknown>,
    accessToken: string,
    maxRetries = 3
  ): Promise<T> {
    let attempt = 0;
    const baseUrl = this.getBaseUrl(accessToken);
    const fullUrl = `${baseUrl}${endpoint}`;

    while (attempt < maxRetries) {
      try {
        const response = await axios.post<T>(fullUrl, data, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });
        return response.data;
      } catch (error) {
        const parsedError = this.parseMetaError(error);

        // Se for erro de Rate Limit (código 4, 17, 32, 613), aplica retry com backoff exponencial
        if (parsedError instanceof MetaRateLimitError && attempt < maxRetries - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.warn(
            `[InstagramClient] Rate limit detectado. Aguardando ${delayMs}ms antes da tentativa ${attempt + 1}/${maxRetries}...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Lança os erros mapeados específicos (190, 10, etc.)
        throw parsedError;
      }
    }

    throw new MetaRateLimitError('Excedido número máximo de tentativas de rate limit', 4);
  }

  /**
   * Converte erros do Axios em classes tipadas específicas da Meta.
   */
  private parseMetaError(error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const axiosError = error as AxiosError<MetaErrorResponseData>;
    const metaError = axiosError.response?.data?.error;

    if (!metaError) {
      return new Error(axiosError.message);
    }

    const { message, code, error_subcode, fbtrace_id, type } = metaError;

    // Erro 190: Token Inválido / Expirado
    if (code === 190) {
      return new MetaTokenExpiredError(message, error_subcode, fbtrace_id);
    }

    // Erro 10: Mensagem fora da janela de 24 horas
    if (code === 10) {
      return new MetaOutside24hWindowError(message, error_subcode, fbtrace_id);
    }

    // Erro 4 / 17 / 32 / 613: Rate Limits
    if (code === 4 || code === 17 || code === 32 || code === 613) {
      return new MetaRateLimitError(message, code, error_subcode, fbtrace_id);
    }

    // Erro genérico da Graph API
    return new MetaGraphApiError(message, code, error_subcode, type, fbtrace_id);
  }
}

export const instagramClient = new InstagramClient();
