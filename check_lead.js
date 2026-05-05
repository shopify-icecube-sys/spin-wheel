import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const code = '10PERCENT-XGM05A';
  const leads = await prisma.lead.findMany({
    where: { couponCode: code }
  });
  console.log(JSON.stringify(leads, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
