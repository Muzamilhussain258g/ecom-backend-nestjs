ALTER TABLE "Media" ADD COLUMN "providerAssetId" TEXT;
CREATE UNIQUE INDEX "Media_providerAssetId_key" ON "Media"("providerAssetId");

ALTER TABLE "ProductMedia" ADD COLUMN "variantValueId" INTEGER;
CREATE INDEX "ProductMedia_variantValueId_idx" ON "ProductMedia"("variantValueId");
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_variantValueId_fkey"
FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy product images before removing the old table.
INSERT INTO "Media" ("providerPublicId", "url", "createdAt", "updatedAt")
SELECT DISTINCT "imageId", "productImageUrl", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProductImage"
ON CONFLICT ("providerPublicId") DO NOTHING;

INSERT INTO "ProductMedia" (
  "productId", "mediaId", "isPrimary", "position", "variantValueId"
)
SELECT pi."productId", m."id", pi."isPrimary",
       (ROW_NUMBER() OVER (PARTITION BY pi."productId" ORDER BY pi."id") - 1)::INTEGER,
       pi."variantValueId"
FROM "ProductImage" pi
JOIN "Media" m ON m."providerPublicId" = pi."imageId"
ON CONFLICT ("productId", "mediaId") DO NOTHING;

DROP TABLE "ProductImage";

CREATE TABLE "CategoryMedia" (
  "id" SERIAL NOT NULL,
  "categoryId" INTEGER NOT NULL,
  "mediaId" INTEGER NOT NULL,
  "altText" TEXT,
  CONSTRAINT "CategoryMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryMedia_categoryId_key" ON "CategoryMedia"("categoryId");
CREATE INDEX "CategoryMedia_mediaId_idx" ON "CategoryMedia"("mediaId");
ALTER TABLE "CategoryMedia" ADD CONSTRAINT "CategoryMedia_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryMedia" ADD CONSTRAINT "CategoryMedia_mediaId_fkey"
FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Collection" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

CREATE TABLE "CollectionMedia" (
  "id" SERIAL NOT NULL,
  "collectionId" INTEGER NOT NULL,
  "mediaId" INTEGER NOT NULL,
  "altText" TEXT,
  CONSTRAINT "CollectionMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectionMedia_collectionId_key" ON "CollectionMedia"("collectionId");
CREATE INDEX "CollectionMedia_mediaId_idx" ON "CollectionMedia"("mediaId");
ALTER TABLE "CollectionMedia" ADD CONSTRAINT "CollectionMedia_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionMedia" ADD CONSTRAINT "CollectionMedia_mediaId_fkey"
FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CollectionProduct" (
  "id" SERIAL NOT NULL,
  "collectionId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectionProduct_collectionId_productId_key"
ON "CollectionProduct"("collectionId", "productId");
CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");
CREATE INDEX "CollectionProduct_collectionId_position_idx"
ON "CollectionProduct"("collectionId", "position");
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
