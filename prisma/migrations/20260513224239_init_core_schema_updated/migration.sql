/*
  Warnings:

  - You are about to alter the column `ticker` on the `Stock` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(10)`.
  - You are about to alter the column `companyName` on the `Stock` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `cik` on the `Stock` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `email` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `passwordHash` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the `PriceUpdateError` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PriceUpdateRun` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[cik]` on the table `Stock` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "PriceUpdateError" DROP CONSTRAINT "PriceUpdateError_runId_fkey";

-- DropIndex
DROP INDEX "WatchlistItem_stockId_idx";

-- DropIndex
DROP INDEX "WatchlistItem_userId_idx";

-- AlterTable
ALTER TABLE "Stock" ALTER COLUMN "ticker" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "companyName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "cik" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "passwordHash" SET DATA TYPE VARCHAR(255);

-- DropTable
DROP TABLE "PriceUpdateError";

-- DropTable
DROP TABLE "PriceUpdateRun";

-- CreateIndex
CREATE UNIQUE INDEX "Stock_cik_key" ON "Stock"("cik");
