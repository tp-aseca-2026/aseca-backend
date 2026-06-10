import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const stocks = [
    { ticker: 'AAPL', companyName: 'Apple Inc.', cik: '0000320193' },
    { ticker: 'MSFT', companyName: 'Microsoft Corporation', cik: '0000789019' },
    { ticker: 'NVDA', companyName: 'NVIDIA Corporation', cik: '0001045810' },
    { ticker: 'GOOGL', companyName: 'Alphabet Inc.', cik: '0001652044' },
    { ticker: 'TSLA', companyName: 'Tesla Inc.', cik: '0001318605' },
  ];

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { ticker: stock.ticker },
      update: stock,
      create: stock,
    });
  }

  console.log('Stocks precargados correctamente');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
