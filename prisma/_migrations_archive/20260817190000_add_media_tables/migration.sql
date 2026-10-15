CREATE TABLE "Media" (
  "id" SERIAL NOT NULL,
  "providerPublicId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "format" TEXT,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductMedia" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "mediaId" INTEGER NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "altText" TEXT,
  CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Media_providerPublicId_key"
ON "Media"("providerPublicId");

CREATE UNIQUE INDEX "ProductMedia_productId_mediaId_key"
ON "ProductMedia"("productId", "mediaId");

CREATE INDEX "ProductMedia_productId_position_idx"
ON "ProductMedia"("productId", "position");

CREATE INDEX "ProductMedia_mediaId_idx"
ON "ProductMedia"("mediaId");

ALTER TABLE "ProductMedia"
ADD CONSTRAINT "ProductMedia_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductMedia"
ADD CONSTRAINT "ProductMedia_mediaId_fkey"
FOREIGN KEY ("mediaId") REFERENCES "Media"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
