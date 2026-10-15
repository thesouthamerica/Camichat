import { PrismaClient } from '@prisma/client';
import { env } from '@/config/env.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Helper to ensure a tenant query context is always scoped to an organization.
 * Enforces the rule: All database queries must be multi-tenant.
 */
export function getTenantScope(organizationId: string) {
  if (!organizationId) {
    throw new Error('Multi-tenancy violation: organization_id is required for database operations');
  }

  return {
    organizationId,
  };
}
