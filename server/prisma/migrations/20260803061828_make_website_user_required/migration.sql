/*
  Warnings:

  - Made the column `userId` on table `websites` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "websites" DROP CONSTRAINT "websites_userId_fkey";

-- AlterTable
ALTER TABLE "websites" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
