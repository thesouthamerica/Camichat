-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('KEYWORD', 'STORY_MENTION', 'STORY_REPLY', 'COMMENT_REPLY', 'DIRECT_MESSAGE', 'DEFAULT_FALLBACK', 'POSTBACK');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('MESSAGE', 'DELAY', 'CONDITION', 'ACTION', 'QUICK_REPLY', 'SMART_AI', 'SET_CUSTOM_FIELD', 'ADD_TAG', 'REMOVE_TAG');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ig_user_id" VARCHAR(100) NOT NULL,
    "page_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255),
    "username" VARCHAR(100),
    "access_token_encrypted" TEXT NOT NULL,
    "access_token_iv" VARCHAR(64) NOT NULL,
    "access_token_tag" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "instagram_account_id" TEXT NOT NULL,
    "ig_scoped_id" VARCHAR(100) NOT NULL,
    "username" VARCHAR(100),
    "name" VARCHAR(255),
    "profile_pic" TEXT,
    "opt_out" BOOLEAN NOT NULL DEFAULT false,
    "last_interaction_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flows" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "instagram_account_id" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger_type" "TriggerType" NOT NULL,
    "trigger_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_steps" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "step_key" VARCHAR(100) NOT NULL,
    "node_type" "NodeType" NOT NULL,
    "payload" JSONB NOT NULL,
    "next_routes" JSONB NOT NULL DEFAULT '[]',
    "position_x" DOUBLE PRECISION,
    "position_y" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "instagram_account_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "flow_id" TEXT,
    "flow_step_id" TEXT,
    "mid" VARCHAR(255),
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "raw_payload" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "error_message" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_instagram_accounts_organization_id" ON "instagram_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "idx_instagram_accounts_ig_user_id" ON "instagram_accounts"("ig_user_id");

-- CreateIndex
CREATE INDEX "idx_instagram_accounts_page_id" ON "instagram_accounts"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_organization_id_ig_user_id_key" ON "instagram_accounts"("organization_id", "ig_user_id");

-- CreateIndex
CREATE INDEX "idx_contacts_ig_scoped_id" ON "contacts"("ig_scoped_id");

-- CreateIndex
CREATE INDEX "idx_contacts_organization_id" ON "contacts"("organization_id");

-- CreateIndex
CREATE INDEX "idx_contacts_last_interaction_at" ON "contacts"("last_interaction_at");

-- CreateIndex
CREATE INDEX "idx_contacts_org_last_interaction" ON "contacts"("organization_id", "last_interaction_at");

-- CreateIndex
CREATE INDEX "idx_contacts_org_opt_out" ON "contacts"("organization_id", "opt_out");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organization_id_ig_scoped_id_key" ON "contacts"("organization_id", "ig_scoped_id");

-- CreateIndex
CREATE INDEX "idx_flows_organization_id" ON "flows"("organization_id");

-- CreateIndex
CREATE INDEX "idx_flows_org_active" ON "flows"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_flows_org_trigger" ON "flows"("organization_id", "trigger_type");

-- CreateIndex
CREATE INDEX "idx_flow_steps_organization_id" ON "flow_steps"("organization_id");

-- CreateIndex
CREATE INDEX "idx_flow_steps_flow_id" ON "flow_steps"("flow_id");

-- CreateIndex
CREATE UNIQUE INDEX "flow_steps_flow_id_step_key_key" ON "flow_steps"("flow_id", "step_key");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_logs_mid_key" ON "conversation_logs"("mid");

-- CreateIndex
CREATE INDEX "idx_conversation_logs_organization_id" ON "conversation_logs"("organization_id");

-- CreateIndex
CREATE INDEX "idx_conversation_logs_contact_id" ON "conversation_logs"("contact_id");

-- CreateIndex
CREATE INDEX "idx_conversation_logs_instagram_account_id" ON "conversation_logs"("instagram_account_id");

-- CreateIndex
CREATE INDEX "idx_conversation_logs_org_timestamp" ON "conversation_logs"("organization_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_conversation_logs_org_status" ON "conversation_logs"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flows" ADD CONSTRAINT "flows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flows" ADD CONSTRAINT "flows_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_steps" ADD CONSTRAINT "flow_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_steps" ADD CONSTRAINT "flow_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_flow_step_id_fkey" FOREIGN KEY ("flow_step_id") REFERENCES "flow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
