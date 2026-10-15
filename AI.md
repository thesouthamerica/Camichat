# CAMICHAT - Diretrizes de Desenvolvimento e Governança de IA (AI.md)

Este documento define os padrões arquiteturais, técnicos e de governança para o desenvolvimento do backend do **Camichat** (Clone Manychat para Automação de Instagram).

---

## 🛡️ Regras Inegociáveis de Engenharia

### 1. Tipagem Estrita (Zero `any`)
- O uso de `any` é terminantemente proibido em todo o repositório.
- Use `unknown` com asserções seguras (Zod, type guards `is...`).
- Todos os contratos de entrada e saída (DTOs, eventos de fila, respostas da Meta Graph API) devem ser expressos em schemas Zod ou interfaces/types dedicados.

### 2. Desacoplamento Absoluto do Webhook
- **Webhook Endpoint**: `POST /api/webhooks/meta`
- O webhook é apenas uma porta de entrada assíncrona.
- **Fluxo permitido no controller**:
  1. Extrair cabeçalho `x-hub-signature-256`.
  2. Verificar assinatura HMAC SHA-256 usando `crypto.timingSafeEqual`.
  3. Adicionar o payload bruto/parseado na fila BullMQ (`meta-events`).
  4. Retornar HTTP 200 `{ "status": "received" }`.
- Nenhuma query ao banco de dados, chamada à Meta Graph API ou execução de nó de fluxo pode ocorrer na requisição do webhook.

### 3. Latência do Webhook (< 100ms)
- O tempo de processamento da requisição HTTP do webhook DEVE ser inferior a 100ms.
- A Meta desativa webhooks de apps que respondem lentamente ou com timeout.

### 4. Validação de Assinatura Meta (HMAC SHA-256 + timingSafeEqual)
- Toda requisição recebida nos webhooks da Meta deve ser autenticada contra o `META_APP_SECRET`.
- Header: `x-hub-signature-256` no formato `sha256=<hex_digest>`.
- O cálculo deve usar o **Buffer bruto (raw body)** da requisição antes de qualquer transformação JSON.
- A comparação de hashes DEVE usar `crypto.timingSafeEqual` para blindar o sistema contra Timing Attacks.

### 5. Criptografia em Repouso para Tokens (AES-256-GCM)
- Tokens de acesso da Meta (Instagram Page Access Tokens, User Access Tokens) e chaves sensíveis NUNCA devem ser armazenados em texto plano no banco de dados.
- Utilize o algoritmo autenticado **AES-256-GCM**.
- O dado cifrado deve conter:
  - `iv`: Vetor de inicialização (12 bytes recomendado para GCM).
  - `authTag`: Tag de autenticação gerada pelo cipher (16 bytes).
  - `encrypted`: Texto cifrado.
- A chave de criptografia de 256 bits (`APP_ENCRYPTION_KEY`) deve ser obtida das variáveis de ambiente validadas.

### 6. Isolamento Multi-Tenant Obrigatório (`organization_id`)
- Todos os recursos de negócio são indexados por `organization_id`.
- Nenhuma consulta ou mutação via Prisma pode omitir o filtro `where: { organization_id, ... }`.
- Utilize extensões ou middleware do Prisma para validar e forçar o escopo de organização.

---

## 📁 Estrutura de Pastas

```
Camichat/
├── prisma/
│   └── schema.prisma           # Modelagem de dados com isolamento multi-tenant
├── src/
│   ├── config/
│   │   └── env.ts              # Validação de variáveis de ambiente com Zod
│   ├── modules/
│   │   ├── webhooks/           # Ingestão de Webhooks da Meta
│   │   │   ├── webhooks.controller.ts
│   │   │   ├── webhooks.routes.ts
│   │   │   └── webhooks.service.ts
│   │   ├── queues/             # BullMQ Queues e Workers
│   │   │   ├── meta-events.queue.ts
│   │   │   └── meta-events.worker.ts
│   │   ├── automations/        # Processamento de fluxos Manychat
│   │   ├── meta/               # Clientes e utilitários da Meta Graph API
│   │   └── organizations/      # Gestão de tenants
│   ├── shared/
│   │   ├── crypto/
│   │   │   ├── aes.ts          # Criptografia AES-256-GCM
│   │   │   └── hmac.ts         # Validação de assinatura com timingSafeEqual
│   │   ├── database/
│   │   │   └── prisma.ts       # Singleton do Prisma Client
│   │   ├── redis/
│   │   │   └── connection.ts   # Conexão ioredis centralizada
│   │   └── errors/
│   │       └── app-error.ts    # Tratamento consistente de exceções
│   ├── app.ts                  # Configuração do Fastify (CORS, Raw Body, Hooks)
│   └── server.ts               # Inicialização do servidor HTTP e Workers
├── .cursorrules                # Regras de governança para editores IA
├── AI.md                       # Documento de governança e arquitetura
├── package.json
└── tsconfig.json
```

---

## ⚙️ Stack Tecnológica

| Componente | Tecnologia | Finalidade |
|---|---|---|
| HTTP Server | Fastify v5 | Servidor assíncrono de altíssimo throughput |
| Linguagem | TypeScript 5 (Strict) | Tipagem estrita com zero `any` |
| Validação de Dados | Zod | Schemas de entrada, envs e DTOs |
| ORM | Prisma | Modelagem de dados relacional com multi-tenancy |
| Filas e Jobs | BullMQ | Processamento assíncrono de eventos da Meta |
| Armazenamento em Memória | ioredis | Broker de filas BullMQ e cache |
| Requisições HTTP | Axios | Integração com Instagram Graph API |
| Criptografia | Node.js `crypto` nativo | AES-256-GCM e HMAC SHA-256 (`timingSafeEqual`) |
