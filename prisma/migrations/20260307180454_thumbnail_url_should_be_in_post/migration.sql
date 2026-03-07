/*
  Warnings:

  - You are about to drop the column `thumbnailUrl` on the `Media` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Media" DROP COLUMN "thumbnailUrl";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "thumbnailUrl" TEXT;
