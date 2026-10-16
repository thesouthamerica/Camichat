# 🚀 CHECKLIST DE ATIVAÇÃO E TESTE REAL - CAMICHAT
> Documento de passo a passo para conectar o banco, configurar a Meta e validar o fluxo ao vivo.

---

### 📊 Resumo do Status
- [x] **Etapa 1**: Provisionar o Banco de Dados (Supabase) - **✅ CONCLUÍDO**
- [x] **Etapa 2**: Provisionar o Redis (Upstash) - **✅ CONCLUÍDO**
- [x] **Etapa 3**: Preencher o arquivo `.env` - **✅ CONCLUÍDO**
- [x] **Etapa 4**: Rodar as Migrations do Prisma - **✅ CONCLUÍDO**
- [x] **Etapa 5**: Meta for Developers (Instagram Graph API) - **✅ CONCLUÍDO**
- [x] **Etapa 6**: Expor o Servidor Local via Túnel HTTPS - **✅ CONCLUÍDO**
- [x] **Etapa 7**: Iniciar o Backend - **✅ CONCLUÍDO**
- [x] **Etapa 8**: Cadastrar o Webhook no Painel da Meta - **✅ CONCLUÍDO**
- [x] **Etapa 9**: Inserir Dados Iniciais via Seed - **✅ CONCLUÍDO**
- [x] **Etapa 10**: O Teste Real ao Vivo 🎯 - **✅ CONCLUÍDO (VALIDADO COM SUCESSO)**

---

## 📌 Etapa 1: Provisionar o Banco de Dados (Supabase / PostgreSQL) - ✅ CONCLUÍDO
- [x] Projeto criado no Supabase na região `sa-east-1` (São Paulo).
- [x] `DATABASE_URL` configurada no `.env` (Porta 6543 / Transaction Pooler com pgbouncer).
- [x] `DIRECT_URL` configurada no `.env` e no `schema.prisma` (Porta 5432 / Session Pooler para migrações).
- [x] Conexão com o banco testada e validada.

---

## 📌 Etapa 2: Provisionar o Redis (BullMQ Broker) - ✅ CONCLUÍDO
- [x] Instância criada no Upstash Redis na região `sa-east-1` (São Paulo) no plano Free.
- [x] Suporte a conexão segura TLS (`rediss://`) integrado ao backend.
- [x] `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` configurados no `.env`.
- [x] Teste de conectividade executado com sucesso (`PING ➔ PONG`).

---

## 📌 Etapa 3: Preencher o arquivo `.env` - ✅ CONCLUÍDO
- [x] Servidor (`NODE_ENV`, `PORT`, `HOST`) configurado.
- [x] Chave de criptografia AES-256-GCM (`APP_ENCRYPTION_KEY`) definida.
- [x] Supabase (`DATABASE_URL`, `DIRECT_URL`) configurado.
- [x] Redis (`REDIS_URL`, `REDIS_HOST`, etc.) configurado.
- [x] Credenciais da Meta (`META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`) configuradas.

---

## 📌 Etapa 4: Rodar as Migrations do Prisma - ✅ CONCLUÍDO
- [x] Migration `20261015152303_init` executada com sucesso no Supabase.
- [x] Tabelas criadas no PostgreSQL:
  - `organizations` (Tenants)
  - `instagram_accounts` (Tokens criptografados em repouso AES-256-GCM)
  - `contacts` (Leads e conformidade LGPD)
  - `flows` (Fluxos de automação)
  - `flow_steps` (Nós de mensagens, delays e botões)
  - `conversation_logs` (Histórico de auditoria e auditoria Meta Message IDs)
- [x] Prisma Client gerado e sincronizado com o banco.

---

## 📌 Etapa 5: Meta for Developers (Instagram Graph API) - ⏳ EM ANDAMENTO
1. Acessar o [Meta for Developers](https://developers.facebook.com/).
2. Criar aplicativo do tipo **Empresarial / Business**.
3. Adicionar o produto **Instagram Graph API** / **Mensagens do Instagram**.
4. Em **Configurações Básicas**:
   - Copiar o **ID do Aplicativo** -> preencher `META_APP_ID` no `.env`.
   - Copiar a **Chave Secreta do Aplicativo** -> preencher `META_APP_SECRET` no `.env`.
   - Definir uma senha forte para o webhook -> preencher `META_VERIFY_TOKEN` no `.env`.
5. Em **Mensagens do Instagram**:
   - Vincular sua Página do Facebook e sua Conta Profissional do Instagram.
   - Gerar o **Page Access Token** de longa duração com as permissões:
     - `instagram_basic`
     - `instagram_manage_messages`
     - `pages_manage_metadata`
     - `pages_read_engagement`

---

## 📌 Etapa 6: Expor o Servidor Local via Túnel HTTPS - ⏳ PENDENTE
A Meta exige uma URL pública com certificado SSL válido (HTTPS) para entregar os Webhooks:
- **Opção A (Cloudflare Tunnel - Sem limite)**:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
- **Opção B (Ngrok)**:
  ```bash
  ngrok http 3000
  ```
*Copiar a URL HTTPS gerada (exemplo: `https://xxxx.ngrok-free.app`).*

---

## 📌 Etapa 7: Iniciar o Backend - ⏳ PENDENTE
Iniciar o servidor Fastify e os workers do BullMQ:
```bash
npm run dev
```

---

## 📌 Etapa 8: Cadastrar o Webhook no Painel da Meta - ⏳ PENDENTE
1. No painel da Meta, ir em **Webhooks** -> objeto **Instagram**.
2. Clicar em **Editar URL de Retorno**:
   - **URL de Retorno**: `https://sua-url-do-tunel/webhook`
   - **Token de Verificação**: o mesmo valor definido em `META_VERIFY_TOKEN`.
3. Clicar em **Verificar e Salvar** (o backend responde em < 3ms).
4. Assinar os eventos:
   - `messages`
   - `messaging_postbacks`
   - `messaging_optins`

---

## 📌 Etapa 9: Inserir Dados Iniciais via Seed - ⏳ PENDENTE
Executar script de seed para criar a Organização, vincular a conta do Instagram e criar o fluxo de boas-vindas com palavra-chave:
```bash
npx tsx prisma/seed.ts
```

---

## 📌 Etapa 10: O Teste Real ao Vivo 🎯 - ⏳ PENDENTE
1. Mandar DM de teste para a conta conectada.
2. **Teste 1**: Enviar palavra-chave (ex: "Oi" ou "TESTE") e verificar resposta automática com botões.
3. **Teste 2**: Clicar no botão interativo (Quick Reply).
4. **Teste 3 (LGPD)**: Enviar "PARAR" ou "SAIR" e verificar o descadastro.
5. **Auditoria**: Visualizar logs salvos no Supabase / Prisma Studio.
