CREATE TABLE "Faq" (
    "id" SERIAL NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "answer" VARCHAR(5000) NOT NULL,
    "productId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Faq_productId_isActive_sortOrder_idx" ON "Faq"("productId", "isActive", "sortOrder");
ALTER TABLE "Faq" ADD CONSTRAINT "Faq_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
