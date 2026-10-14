-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Certificate_isFeatured_idx" ON "Certificate"("isFeatured");
