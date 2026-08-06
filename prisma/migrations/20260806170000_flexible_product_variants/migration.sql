-- Add the new normalized variant structure before removing legacy columns.
ALTER TABLE "Product" ADD COLUMN "hasVariants" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "VariantType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VariantType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VariantValue" (
    "id" SERIAL NOT NULL,
    "variantTypeId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VariantValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariantType" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantTypeId" INTEGER NOT NULL,
    CONSTRAINT "ProductVariantType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariantValue" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantValueId" INTEGER NOT NULL,
    CONSTRAINT "ProductVariantValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VariantCombinationValue" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "variantValueId" INTEGER NOT NULL,
    CONSTRAINT "VariantCombinationValue_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Variant"
    ADD COLUMN "productId" INTEGER,
    ADD COLUMN "combinationKey" TEXT,
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProductImage"
    ADD COLUMN "productId" INTEGER,
    ADD COLUMN "variantValueId" INTEGER;

CREATE UNIQUE INDEX "VariantType_slug_key" ON "VariantType"("slug");
CREATE UNIQUE INDEX "VariantValue_variantTypeId_code_key" ON "VariantValue"("variantTypeId", "code");
CREATE INDEX "VariantValue_variantTypeId_idx" ON "VariantValue"("variantTypeId");
CREATE UNIQUE INDEX "ProductVariantType_productId_variantTypeId_key" ON "ProductVariantType"("productId", "variantTypeId");
CREATE INDEX "ProductVariantType_variantTypeId_idx" ON "ProductVariantType"("variantTypeId");
CREATE UNIQUE INDEX "ProductVariantValue_productId_variantValueId_key" ON "ProductVariantValue"("productId", "variantValueId");
CREATE INDEX "ProductVariantValue_variantValueId_idx" ON "ProductVariantValue"("variantValueId");
CREATE UNIQUE INDEX "VariantCombinationValue_variantId_variantValueId_key" ON "VariantCombinationValue"("variantId", "variantValueId");
CREATE INDEX "VariantCombinationValue_variantValueId_idx" ON "VariantCombinationValue"("variantValueId");

-- Create global master types only when legacy records need them.
INSERT INTO "VariantType" ("name", "slug", "sortOrder")
SELECT 'Color', 'color', 0
WHERE EXISTS (SELECT 1 FROM "ProductColor");

INSERT INTO "VariantType" ("name", "slug", "sortOrder")
SELECT 'Size', 'size', 1
WHERE EXISTS (SELECT 1 FROM "Variant");

-- Normalize legacy labels into stable reusable codes.
WITH normalized_colors AS (
    SELECT DISTINCT ON ("code")
        TRIM(pc."color") AS "value",
        COALESCE(
            NULLIF(REGEXP_REPLACE(UPPER(TRIM(pc."color")), '[^A-Z0-9]+', '-', 'g'), ''),
            'COLOR-' || SUBSTRING(MD5(TRIM(pc."color")), 1, 8)
        ) AS "code",
        pc."colorHex" AS "hex"
    FROM "ProductColor" pc
    ORDER BY "code", pc."id"
)
INSERT INTO "VariantValue" ("variantTypeId", "value", "code", "metadata", "sortOrder")
SELECT vt."id", nc."value", nc."code", JSONB_BUILD_OBJECT('hex', nc."hex"), 0
FROM normalized_colors nc
JOIN "VariantType" vt ON vt."slug" = 'color';

WITH normalized_sizes AS (
    SELECT DISTINCT
        TRIM(v."size") AS "value",
        COALESCE(
            NULLIF(REGEXP_REPLACE(UPPER(TRIM(v."size")), '[^A-Z0-9]+', '-', 'g'), ''),
            'SIZE-' || SUBSTRING(MD5(TRIM(v."size")), 1, 8)
        ) AS "code"
    FROM "Variant" v
)
INSERT INTO "VariantValue" ("variantTypeId", "value", "code", "sortOrder")
SELECT vt."id", ns."value", ns."code", 0
FROM normalized_sizes ns
JOIN "VariantType" vt ON vt."slug" = 'size'
ON CONFLICT ("variantTypeId", "code") DO NOTHING;

INSERT INTO "ProductVariantType" ("productId", "variantTypeId")
SELECT DISTINCT pc."productId", vt."id"
FROM "ProductColor" pc
JOIN "VariantType" vt ON vt."slug" = 'color';

INSERT INTO "ProductVariantType" ("productId", "variantTypeId")
SELECT DISTINCT pc."productId", vt."id"
FROM "Variant" v
JOIN "ProductColor" pc ON pc."id" = v."productColorId"
JOIN "VariantType" vt ON vt."slug" = 'size'
ON CONFLICT ("productId", "variantTypeId") DO NOTHING;

INSERT INTO "ProductVariantValue" ("productId", "variantValueId")
SELECT DISTINCT pc."productId", vv."id"
FROM "ProductColor" pc
JOIN "VariantType" vt ON vt."slug" = 'color'
JOIN "VariantValue" vv
  ON vv."variantTypeId" = vt."id"
 AND vv."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(pc."color")), '[^A-Z0-9]+', '-', 'g'), ''),
    'COLOR-' || SUBSTRING(MD5(TRIM(pc."color")), 1, 8)
 );

INSERT INTO "ProductVariantValue" ("productId", "variantValueId")
SELECT DISTINCT pc."productId", vv."id"
FROM "Variant" v
JOIN "ProductColor" pc ON pc."id" = v."productColorId"
JOIN "VariantType" vt ON vt."slug" = 'size'
JOIN "VariantValue" vv
  ON vv."variantTypeId" = vt."id"
 AND vv."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(v."size")), '[^A-Z0-9]+', '-', 'g'), ''),
    'SIZE-' || SUBSTRING(MD5(TRIM(v."size")), 1, 8)
 )
ON CONFLICT ("productId", "variantValueId") DO NOTHING;

-- Preserve each existing Variant ID so cart and order foreign keys stay valid.
UPDATE "Variant" v
SET
    "productId" = pc."productId",
    "combinationKey" = CONCAT(
        LEAST(color_value."id", size_value."id"),
        '-',
        GREATEST(color_value."id", size_value."id")
    )
FROM "ProductColor" pc
JOIN "VariantType" color_type ON color_type."slug" = 'color'
JOIN "VariantValue" color_value
  ON color_value."variantTypeId" = color_type."id"
 AND color_value."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(pc."color")), '[^A-Z0-9]+', '-', 'g'), ''),
    'COLOR-' || SUBSTRING(MD5(TRIM(pc."color")), 1, 8)
 )
JOIN "VariantType" size_type ON size_type."slug" = 'size'
JOIN "VariantValue" size_value ON size_value."variantTypeId" = size_type."id"
WHERE pc."id" = v."productColorId"
  AND size_value."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(v."size")), '[^A-Z0-9]+', '-', 'g'), ''),
    'SIZE-' || SUBSTRING(MD5(TRIM(v."size")), 1, 8)
  );

INSERT INTO "VariantCombinationValue" ("variantId", "variantValueId")
SELECT v."id", vv."id"
FROM "Variant" v
JOIN "ProductColor" pc ON pc."id" = v."productColorId"
JOIN "VariantType" vt ON vt."slug" = 'color'
JOIN "VariantValue" vv
  ON vv."variantTypeId" = vt."id"
 AND vv."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(pc."color")), '[^A-Z0-9]+', '-', 'g'), ''),
    'COLOR-' || SUBSTRING(MD5(TRIM(pc."color")), 1, 8)
 )
UNION ALL
SELECT v."id", vv."id"
FROM "Variant" v
JOIN "VariantType" vt ON vt."slug" = 'size'
JOIN "VariantValue" vv
  ON vv."variantTypeId" = vt."id"
 AND vv."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(v."size")), '[^A-Z0-9]+', '-', 'g'), ''),
    'SIZE-' || SUBSTRING(MD5(TRIM(v."size")), 1, 8)
 )
ON CONFLICT ("variantId", "variantValueId") DO NOTHING;

UPDATE "ProductImage" pi
SET
    "productId" = pc."productId",
    "variantValueId" = vv."id"
FROM "ProductColor" pc
JOIN "VariantType" vt ON vt."slug" = 'color'
JOIN "VariantValue" vv
  ON vv."variantTypeId" = vt."id"
 AND vv."code" = COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(pc."color")), '[^A-Z0-9]+', '-', 'g'), ''),
    'COLOR-' || SUBSTRING(MD5(TRIM(pc."color")), 1, 8)
 )
WHERE pc."id" = pi."productColorId";

UPDATE "Product" p
SET "hasVariants" = true
WHERE EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p."id");

ALTER TABLE "Variant" DROP CONSTRAINT "Variant_productColorId_fkey";
ALTER TABLE "ProductImage" DROP CONSTRAINT "ProductImage_productColorId_fkey";
ALTER TABLE "Variant" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "Variant" ALTER COLUMN "combinationKey" SET NOT NULL;
ALTER TABLE "ProductImage" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "Variant" DROP COLUMN "productColorId", DROP COLUMN "size";
ALTER TABLE "ProductImage" DROP COLUMN "productColorId";
DROP TABLE "ProductColor";

-- Products which had no sellable row receive one hidden/default combination.
INSERT INTO "Variant" ("productId", "combinationKey", "stock", "sku", "price", "isActive")
SELECT p."id", 'default', 0, 'P-' || p."id" || '-DEFAULT', p."basePrice", true
FROM "Product" p
WHERE NOT EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p."id");

CREATE UNIQUE INDEX "Variant_productId_combinationKey_key" ON "Variant"("productId", "combinationKey");
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");
CREATE INDEX "ProductImage_variantValueId_idx" ON "ProductImage"("variantValueId");

ALTER TABLE "VariantValue" ADD CONSTRAINT "VariantValue_variantTypeId_fkey"
FOREIGN KEY ("variantTypeId") REFERENCES "VariantType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductVariantType" ADD CONSTRAINT "ProductVariantType_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantType" ADD CONSTRAINT "ProductVariantType_variantTypeId_fkey"
FOREIGN KEY ("variantTypeId") REFERENCES "VariantType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductVariantValue" ADD CONSTRAINT "ProductVariantValue_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantValue" ADD CONSTRAINT "ProductVariantValue_variantValueId_fkey"
FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantCombinationValue" ADD CONSTRAINT "VariantCombinationValue_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantCombinationValue" ADD CONSTRAINT "VariantCombinationValue_variantValueId_fkey"
FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantValueId_fkey"
FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
