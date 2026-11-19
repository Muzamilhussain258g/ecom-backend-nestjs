# FAQ API

Base path: `/api/v1`. Public reads need no token. All `/admin/faqs` routes require an admin Bearer token. Swagger: `/api/docs`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /faqs | Active website FAQs |
| GET | /products/:slug/faqs | Active FAQs for an active product; missing/inactive product returns 404 |
| GET | /admin/faqs | All FAQs, including inactive |
| POST | /admin/faqs | Create; returns 201 |
| PATCH | /admin/faqs/:id | Edit content, visibility or order |
| DELETE | /admin/faqs/:id | Permanent deletion |

Responses use the existing application envelope with records in `data`. Lists are unpaginated arrays sorted by `sortOrder`, then `id`. Empty lists return `[]`. Website FAQs are not merged into product FAQs; existing product responses are unchanged.

## Create and edit

Website example:
```json
{
  "question": "Where can I track my order?",
  "answer": "Open your order details to view its current status.",
  "sortOrder": 0,
  "isActive": true
}
```

To create a product FAQ, add `"productId": 123` using an existing product ID. Omitted/null productId means website FAQ. Admins can prepare FAQs for inactive products, but public reads hide them.

Question and answer are trimmed plain text, required on create, with maximum lengths 300 and 5000. Render as text on the frontend. Defaults: sortOrder 0, isActive true. sortOrder must be a non-negative integer. PATCH accepts any subset of question, answer, sortOrder, isActive; null values and unknown fields are rejected. Product association cannot be changed by PATCH.

Admin list accepts `scope=website|product`, positive integer `productId`, and `isActive=true|false`. No filters means all FAQs. Website scope with productId returns 400.

Errors: 400 invalid input, 401 missing/invalid admin authentication, 403 non-admin, 404 missing FAQ/product. Deleting a product cascades to its FAQs.

## Deployment and verification

Apply the additive FAQ migration through the project's normal reviewed migration deployment before releasing the API, then generate Prisma client and build. This migration does not backfill products or seed policy content. Check outstanding migrations before running `npx prisma migrate deploy`; that command applies all pending migrations.

- `npx prisma generate`
- `npm test -- --runInBand src/faq src/product/product.controller.spec.ts src/common/guards/jwt-auth.guard.spec.ts`
- `npx eslint src/faq`
- `npm run build`
- `node scripts/verify-faq-migration.cjs` verifies SQL defaults, foreign key and cascade using temporary tables in a rolled-back PostgreSQL transaction. Uses FAQ_TEST_DATABASE_URL, falling back to DATABASE_URL from .env; requires temporary-table privileges. It never migrates application tables.

Frontend integration: FAQ/help page calls /faqs; product detail accordion calls /products/:slug/faqs and hides itself for an empty array. UI implementation is outside this backend change.
