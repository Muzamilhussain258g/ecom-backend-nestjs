ALTER TABLE "Product" ADD COLUMN "slug" TEXT;

WITH normalized_products AS (
  SELECT
    "id",
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')) AS base_slug
  FROM "Product"
)
UPDATE "Product" AS product
SET "slug" = CONCAT(
  CASE
    WHEN normalized.base_slug = '' THEN 'product'
    ELSE normalized.base_slug
  END,
  '-',
  product."id"
)
FROM normalized_products AS normalized
WHERE product."id" = normalized."id";

ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
