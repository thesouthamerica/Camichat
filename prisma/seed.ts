import { PrismaClient } from '@prisma/client';
import { encryptToken } from '../src/shared/utils/crypto.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados para testes...');

  // 1. Cria ou recupera a Organização inicial (Tenant)
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-tenant' },
    update: {},
    create: {
      name: 'Empresa Demonstração',
      slug: 'demo-tenant',
    },
  });

  console.log(`✅ Organização pronta: ${org.name} (ID: ${org.id})`);

  // 2. Token da Página criptografado com AES-256-GCM
  // Substitua pelo seu Token de Acesso real gerado no Meta for Developers
  const rawPageAccessToken = 'SUBSTITUA_PELO_PAGE_ACCESS_TOKEN_REAL_DA_META';
  const encrypted = encryptToken(rawPageAccessToken);

  // 3. Cadastra a Conta do Instagram conectada
  const instagramAccount = await prisma.instagramAccount.upsert({
    where: {
      org_ig_user_unique: {
        organizationId: org.id,
        igUserId: '17841400000000000', // Substitua pelo seu Instagram Business Account ID real
      },
    },
    update: {
      accessTokenEncrypted: encrypted.encrypted,
      accessTokenIv: encrypted.iv,
      accessTokenTag: encrypted.authTag,
      isActive: true,
    },
    create: {
      organizationId: org.id,
      igUserId: '17841400000000000', // Substitua pelo seu Instagram Business Account ID real
      pageId: '100000000000000',     // Substitua pelo seu Facebook Page ID
      name: 'Conta Teste Instagram',
      username: 'minha_conta_teste',
      accessTokenEncrypted: encrypted.encrypted,
      accessTokenIv: encrypted.iv,
      accessTokenTag: encrypted.authTag,
      isActive: true,
    },
  });

  console.log(`✅ Conta do Instagram conectada: ${instagramAccount.name} (ID: ${instagramAccount.id})`);

  // 4. Cria um Fluxo de Automação de Demonstração (Gatilho por Palavra-Chave)
  const existingFlow = await prisma.flow.findFirst({
    where: {
      organizationId: org.id,
      name: 'Fluxo de Boas-Vindas e Demonstração',
    },
  });

  if (!existingFlow) {
    const flow = await prisma.flow.create({
      data: {
        organizationId: org.id,
        instagramAccountId: instagramAccount.id,
        name: 'Fluxo de Boas-Vindas e Demonstração',
        description: 'Fluxo que responde quando o usuário envia "oi", "ola", "preço" ou "comprar"',
        isActive: true,
        triggerType: 'KEYWORD',
        triggerConfig: {
          keywords: ['oi', 'olá', 'ola', 'preço', 'preco', 'comprar', 'informações'],
          matchType: 'contains',
        },
        steps: {
          create: [
            // Passo 1: Mensagem inicial com botões Quick Reply
            {
              organizationId: org.id,
              stepKey: 'start',
              nodeType: 'MESSAGE',
              payload: {
                text: '👋 Olá! Seja muito bem-vindo ao Camichat!\n\nComo posso te ajudar hoje?',
                buttons: [
                  { title: 'Conhecer Preços 💰', payload: 'ver_precos' },
                  { title: 'Falar com Atendente 👤', payload: 'falar_atendente' },
                ],
              },
              nextRoutes: [{ targetStepKey: 'ver_precos' }],
              positionX: 100,
              positionY: 100,
            },
            // Passo 2: Resposta de Preços
            {
              organizationId: org.id,
              stepKey: 'ver_precos',
              nodeType: 'MESSAGE',
              payload: {
                text: '🚀 Nossos planos começam a partir de R$ 97/mês com automações ilimitadas de direct!',
              },
              nextRoutes: [],
              positionX: 350,
              positionY: 100,
            },
            // Passo 3: Atendimento Humano
            {
              organizationId: org.id,
              stepKey: 'falar_atendente',
              nodeType: 'MESSAGE',
              payload: {
                text: '👨‍💼 Perfeito! Notifiquei nossa equipe e um especialista entrará em contato por este direct em instantes.',
              },
              nextRoutes: [],
              positionX: 350,
              positionY: 250,
            },
          ],
        },
      },
    });

    console.log(`✅ Fluxo de demonstração criado com sucesso! (ID: ${flow.id})`);
  }

  console.log('🎉 Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
