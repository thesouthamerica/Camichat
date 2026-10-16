import { prisma } from '../src/shared/database/prisma.js';

async function main() {
  const flows = await prisma.flow.findMany({
    include: { steps: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Total flows:', flows.length);
  for (const f of flows) {
    console.log(`\nFlow: ${f.name} (Active: ${f.isActive}, Trigger: ${f.triggerType})`);
    console.log('Config:', JSON.stringify(f.triggerConfig));
    if (f.steps[0]) {
      console.log('Step payload:', JSON.stringify(f.steps[0].payload));
    }
  }
}
main().finally(() => process.exit(0));
