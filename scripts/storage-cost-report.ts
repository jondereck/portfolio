import 'dotenv/config';
import { buildStorageCostReport } from '@/lib/server/storage-cost-report';

async function main() {
  const report = await buildStorageCostReport();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  });
