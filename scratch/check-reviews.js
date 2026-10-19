const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.review.count();
  console.log('Current review count in database:', count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
