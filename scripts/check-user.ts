import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'ep8hfcisjisnfzgsdzc9xshgieie' } },
        { email: { contains: 'dingtalk.i2i.local' } }
      ]
    },
    include: { accounts: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

main();
