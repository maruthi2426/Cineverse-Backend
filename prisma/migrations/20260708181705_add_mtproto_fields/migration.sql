-- AlterTable
ALTER TABLE "Videos" ADD COLUMN     "access_hash" BIGINT,
ADD COLUMN     "file_reference" TEXT,
ADD COLUMN     "file_unique_id" TEXT;
