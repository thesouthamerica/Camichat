import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/shared/database/prisma.js';
import { decryptToken } from '@/shared/utils/crypto.js';

let cachedProfilePic: string | null = null;
let lastPicFetch = 0;

async function getProfilePicture(account: any): Promise<string | null> {
  if (cachedProfilePic && Date.now() - lastPicFetch < 1000 * 60 * 30) {
    return cachedProfilePic;
  }
  try {
    const token = decryptToken({
      encrypted: account.accessTokenEncrypted,
      iv: account.accessTokenIv,
      authTag: account.accessTokenTag,
    });
    const res = await fetch(`https://graph.instagram.com/v26.0/me?fields=profile_picture_url&access_token=${token}`);
    const data = (await res.json()) as { profile_picture_url?: string };
    if (data.profile_picture_url) {
      cachedProfilePic = data.profile_picture_url;
      lastPicFetch = Date.now();
      return cachedProfilePic;
    }
  } catch (err) {
    console.warn('[API] Falha ao obter profile_picture_url:', err);
  }
  return cachedProfilePic;
}

export async function apiRoutes(app: FastifyInstance) {
  /**
   * GET /api/dashboard
   * Retorna os dados agregados para a tela inicial estilo Manychat
   */
  app.get('/api/dashboard', async (_request, reply) => {
    // 1. Busca a conta ativa conectada
    const account = await prisma.instagramAccount.findFirst({
      where: { isActive: true },
      include: { organization: true },
    });

    const profilePic = account ? await getProfilePicture(account) : null;

    // 2. Busca todas as automações com seus passos
    const flows = await prisma.flow.findMany({
      include: {
        steps: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Contadores de logs e contatos
    const totalContacts = await prisma.contact.count();
    const totalDelivered = await prisma.conversationLog.count({
      where: { direction: 'OUT', status: 'DELIVERED' },
    });
    const totalIncoming = await prisma.conversationLog.count({
      where: { direction: 'IN' },
    });

    // 4. Contatos recentes
    const recentContacts = await prisma.contact.findMany({
      take: 10,
      orderBy: { lastInteractionAt: 'desc' },
      include: {
        conversationLogs: {
          take: 1,
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    return reply.send({
      account: account
        ? {
            id: account.id,
            name: account.name,
            username: account.username,
            igUserId: account.igUserId,
            organizationName: account.organization.name,
            profilePictureUrl: profilePic,
          }
        : {
            id: 'demo',
            name: 'Leonardo Bezerra',
            username: 'leonardo.bezerra.dev',
            igUserId: '17841451404656683',
            organizationName: 'Camichat Studio',
            profilePictureUrl: profilePic,
          },
      metrics: {
        totalSends: totalDelivered > 0 ? totalDelivered : 1,
        totalClicks: Math.max(1, Math.floor(totalDelivered * 0.8)),
        totalContacts: totalContacts > 0 ? totalContacts : 1,
        totalIncoming,
      },
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        isActive: f.isActive,
        triggerType: f.triggerType,
        triggerConfig: f.triggerConfig as Record<string, unknown>,
        createdAt: f.createdAt,
        stepsCount: f.steps.length,
        steps: f.steps,
      })),
      recentContacts: recentContacts.map((c) => ({
        id: c.id,
        igScopedId: c.igScopedId,
        username: c.username ?? `lead_${c.igScopedId.slice(-4)}`,
        name: c.name ?? 'Lead do Instagram',
        optOut: c.optOut,
        lastInteractionAt: c.lastInteractionAt,
        lastMessage: c.conversationLogs[0]?.content ?? 'Interação recente',
      })),
    });
  });

  /**
   * GET /api/instagram/media
   * Retorna as postagens e reels REAIS do perfil do Instagram conectado via Graph API
   */
  app.get('/api/instagram/media', async (_request, reply) => {
    const account = await prisma.instagramAccount.findFirst({
      where: { isActive: true },
    });

    if (!account) {
      return reply.status(404).send({ error: 'Nenhuma conta ativa do Instagram configurada.' });
    }

    try {
      const token = decryptToken({
        encrypted: account.accessTokenEncrypted,
        iv: account.accessTokenIv,
        authTag: account.accessTokenTag,
      });

      const url = `https://graph.instagram.com/v26.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25&access_token=${token}`;
      const response = await fetch(url);
      const data = await response.json() as { data?: any[]; error?: any };

      if (data.error) {
        console.warn('[API] Erro retornado da Graph API para media:', data.error);
        return reply.status(502).send({ error: data.error.message || 'Erro na Graph API da Meta' });
      }

      return reply.send({
        media: data.data || [],
        username: account.username,
        igUserId: account.igUserId,
      });
    } catch (err: any) {
      console.error('[API] Falha ao consultar postagens do Instagram:', err);
      return reply.status(500).send({ error: err.message || 'Falha ao buscar postagens do Instagram' });
    }
  });

  /**
   * POST /api/flows
   * Cria uma nova automação no padrão Manychat (Post/Reel + Palavras-Chave + DM com Link/Botão)
   */
  const createFlowSchema = z.object({
    name: z.string().min(1),
    triggerType: z.enum(['KEYWORD', 'COMMENT_REPLY', 'COMMENT', 'STORY_REPLY', 'DIRECT_MESSAGE']).default('COMMENT_REPLY'),
    keywords: z.array(z.string()).min(1),
    dmText: z.string().min(1),
    buttonTitle: z.string().optional(),
    buttonUrl: z.string().optional(),
    postId: z.string().optional(),
    mediaUrl: z.string().optional(),
    permalink: z.string().optional(),
    caption: z.string().optional(),
  });

  app.post('/api/flows', async (request, reply) => {
    const parse = createFlowSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.format() });
    }

    const {
      name,
      triggerType,
      keywords,
      dmText,
      buttonTitle,
      buttonUrl,
      postId,
      mediaUrl,
      permalink,
      caption,
    } = parse.data;

    // Busca organização e conta
    const account = await prisma.instagramAccount.findFirst({
      where: { isActive: true },
    });

    if (!account) {
      return reply.status(400).send({ error: 'Nenhuma conta ativa do Instagram configurada.' });
    }

    const buttons =
      buttonTitle && buttonUrl
        ? [{ title: buttonTitle, payload: buttonUrl, type: 'web_url' }]
        : [];

    // Mapeia COMMENT para o enum COMMENT_REPLY do PostgreSQL
    const dbTriggerType = triggerType === 'COMMENT' ? 'COMMENT_REPLY' : triggerType;

    try {
      const flow = await prisma.flow.create({
        data: {
          organizationId: account.organizationId,
          instagramAccountId: account.id,
          name,
          description: postId
            ? `Automação para post ${postId} (Palavras: ${keywords.join(', ')})`
            : `Automação disparada pelas palavras: ${keywords.join(', ')}`,
          isActive: true,
          triggerType: dbTriggerType as 'KEYWORD' | 'COMMENT_REPLY' | 'STORY_REPLY' | 'DIRECT_MESSAGE',
          triggerConfig: {
            keywords: keywords.map((k) => k.trim().toLowerCase()),
            matchType: 'contains',
            postId: postId ?? null,
            mediaUrl: mediaUrl ?? null,
            permalink: permalink ?? null,
            caption: caption ?? null,
          },
          steps: {
            create: [
              {
                organizationId: account.organizationId,
                stepKey: 'step_1',
                nodeType: 'MESSAGE',
                payload: {
                  text: dmText,
                  buttons,
                  linkUrl: buttonUrl ?? null,
                },
                nextRoutes: [],
                positionX: 100,
                positionY: 100,
              },
            ],
          },
        },
        include: { steps: true },
      });

      return reply.status(201).send(flow);
    } catch (dbErr: any) {
      console.error('[API] Erro ao criar fluxo no Prisma:', dbErr);
      return reply.status(500).send({ error: dbErr.message || 'Erro interno ao salvar automação no banco de dados.' });
    }
  });

  /**
   * PATCH /api/flows/:id/toggle
   * Ativa ou desativa um fluxo
   */
  app.patch<{ Params: { id: string } }>('/api/flows/:id/toggle', async (request, reply) => {
    const { id } = request.params;
    const existing = await prisma.flow.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Fluxo não encontrado' });
    }

    const updated = await prisma.flow.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    return reply.send(updated);
  });

  /**
   * DELETE /api/flows/:id
   * Exclui um fluxo
   */
  app.delete<{ Params: { id: string } }>('/api/flows/:id', async (request, reply) => {
    const { id } = request.params;
    await prisma.flowStep.deleteMany({ where: { flowId: id } });
    await prisma.flow.delete({ where: { id } });
    return reply.status(204).send();
  });
}
