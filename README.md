# E-Commerce Backend

NestJS REST API for an e-commerce application, backed by PostgreSQL and Prisma. The project includes authentication, catalog management, variants, media, collections, wishlists, addresses, cart, orders, reviews, user administration, email, and a Gemini shopping assistant.

Frontend product integration is documented separately in [FRONTEND_PRODUCTS_API_GUIDE.md](docs/FRONTEND_PRODUCTS_API_GUIDE.md). Share that file with the frontend team for product requests with and without a token.

## Technology

- TypeScript and NestJS 11 with Express.
- PostgreSQL with Prisma 7 and the PostgreSQL driver adapter.
- Passport JWT authentication and bcrypt password hashing.
- Cloudinary for media; Nodemailer/SMTP and Handlebars for email.
- Google GenAI SDK for the shopping assistant.
- Swagger for API documentation; Jest for tests.

## Local setup

### 1. Prerequisites

Use a Node.js version supported by the installed Prisma package: `^20.19`, `^22.12`, or `>=24.0`. You also need npm, a reachable PostgreSQL database, and credentials for Cloudinary, Gemini, and SMTP.

The repository contains both npm and pnpm lockfiles. Commands below use npm; avoid mixing package managers in the same `node_modules` directory.

### 2. Install dependencies

From the repository root:

```sh
npm ci
```

### 3. Configure environment variables

Create a local `.env` in the repository root using the following placeholder template. Replace all credentials with your own values. `.env` is ignored by Git.

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ecommerce
JWT_ACCESS_TOKEN_SECRET=replace-with-a-long-random-access-secret
JWT_REFRESH_TOKEN_SECRET=replace-with-a-different-long-random-refresh-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
GEMINI_API_KEY=your-gemini-api-key
MAIL_HOST=your-smtp-host
MAIL_PORT=587
MAIL_USER=your-smtp-username
MAIL_PASS=your-smtp-password
MAIL_FROM="Demo Store <hello@example.com>"
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the application and Prisma CLI |
| `JWT_ACCESS_TOKEN_SECRET` | Signs and validates access tokens |
| `JWT_REFRESH_TOKEN_SECRET` | Signs refresh tokens |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Media signing, verification, and deletion |
| `GEMINI_API_KEY` | Required by the AI service constructor, even when only using other routes |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS` | Required SMTP configuration; port falls back to 587 if numeric conversion is falsy |
| `MAIL_FROM` | Default sender address; configure a sender accepted by your mail provider |
| `PORT` | HTTP port; default 3000 |
| `NODE_ENV` | Controls production error-detail handling |

Cloudinary and mail configuration are also initialized with the application. Supplying placeholders allows neither real uploads nor email nor AI calls; use working service credentials for those features. Keep credentials out of shared documentation and Postman exports.

### 4. Prepare the database

Create an empty PostgreSQL database matching `DATABASE_URL`, then run:

```sh
npx prisma generate
npx prisma migrate deploy
```

The generated client is written to `generated/prisma`. Regenerate it after schema changes. The active migration directory is `prisma/migrations`; `prisma/_migrations_archive` contains historical files and is not the configured migration source.

For an existing database with tables but no migration history, inspect and baseline it before applying migrations; do not treat it as an empty database.

### 5. Run the API

```sh
npm run start:dev
```

Default local addresses:

- API base: `http://localhost:3000/api/v1`
- Root GET endpoint: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/docs`

Swagger is mounted outside the `/api/v1` prefix. Request DTOs in each module are the source for payload validation rules. The root GET route is a basic application response, not a dedicated dependency health check.

## Database development and sample data

To create a migration after intentionally editing `prisma/schema.prisma` in development:

```sh
npx prisma migrate dev --name describe_your_change
npx prisma generate
```

To inspect local data:

```sh
npx prisma studio
```

Optional sample catalog seed:

```sh
npm run seed
```

**Run the seed only against a disposable development database.** `prisma/seed.ts` clears existing catalog data and related records, including cart items, order items, wishlist entries, and reviews, before building sample variant types and category/product data. It is not a production bootstrap command and does not provision an admin account.

To add repeatable sample orders, paid payments, customers, and low-stock products for the admin dashboard without clearing the existing catalog, run:

```sh
npm run seed:dashboard
```

This creates or updates records with `dashboard-demo-*` identifiers and dates relative to the current day, so the dashboard's default last-30-days view has data. Run it only against a development database.

## Authentication and roles

New signups receive the database default role, `customer`. Other roles are `seller` and `admin`; provision these through a controlled database/admin workflow. There is no role-assignment endpoint documented by the current controllers.

1. `POST /auth/signup` with `{ "name": "Demo User", "email": "demo@example.com", "password": "example-password" }` creates a user. Signup does not return login tokens.
2. `POST /auth/signin` with email/password returns `data.loggedInUser`, `data.accessToken`, `data.refreshToken`, and `data.refreshTokenId`.
3. Send `Authorization: Bearer <accessToken>` on protected requests.
4. `POST /auth/refresh` with `{ "refreshToken": "...", "refreshTokenId": "..." }` returns `data.newAccessToken`.
5. `POST /auth/signout` uses the same refresh-token fields to revoke the session's refresh token.
6. `GET /auth/me`, `PATCH /auth/profile`, and `PATCH /auth/password` require an access token.

Paths above are relative to `/api/v1`. The current implementation issues a 7-day access token at sign-in and a 15-minute access token on refresh; refresh tokens and stored refresh sessions expire after 7 days. Signout revokes the refresh session, while access-token validation does not check refresh-session revocation.

Product GET requests use optional authentication: guests can browse, authenticated requests include `isWishlisted`, and supplied invalid tokens return `401`. See the separate frontend guide for full examples.

## API modules

All paths below are relative to `/api/v1`. Access rules summarize controller guards; services also enforce ownership and business rules.

| Module | Routes | Access |
| --- | --- | --- |
| Auth | `POST /auth/signup`, `/auth/signin`, `/auth/refresh`, `/auth/signout`; `GET /auth/me`; `PATCH /auth/profile`, `/auth/password` | Signup/signin are public; refresh/signout validate body credentials; profile routes require JWT |
| Categories | `GET /categories`, `GET /categories/:id`; `POST /categories`; `PATCH`, `DELETE /categories/:id` | Public reads; admin/seller writes |
| Products | `GET /products`, `GET /products/:slug`; `POST /products`; `PATCH /products/:id`; `PUT /products/:id/variant-options`; `PATCH /products/:productId/variants/:variantId` | Optional JWT for reads; admin/seller writes |
| Variant types | `GET`, `POST /variant-types`; `PATCH`, `DELETE /variant-types/:id`; `GET`, `POST`, `DELETE /variant-types/:id/values` | Public reads; admin/seller writes |
| Variant values | `GET /variant-values`; `PATCH`, `DELETE /variant-values/:id` | Public reads; admin/seller writes |
| Collections | `GET /collections`, `GET /collections/:slug`; `POST /collections` | Public reads; admin/seller creation |
| Media | `POST /media/upload-signature`; `DELETE /media/:id` | Admin/seller |
| Wishlist | `GET /wishlist`; `POST`, `DELETE /wishlist/:productId` | JWT |
| Addresses | `GET`, `POST /addresses`; `GET`, `PATCH`, `DELETE /addresses/:id` | JWT, user-owned addresses |
| Cart | `GET /cart`; `POST /cart/items`; `PATCH`, `DELETE /cart/items/:itemId`; `DELETE /cart/clear` | JWT |
| Orders | `POST`, `GET /orders`; `GET /orders/:id`; `PATCH /orders/:id/cancel` | JWT |
| Order administration | `GET /orders/admin/all`; `PATCH /orders/admin/:id/status` | Admin/seller |
| Reviews | `GET`, `POST /products/:productId/reviews`; `PATCH`, `DELETE /reviews/:reviewId`; `GET /admin/reviews` | Public product review reads; JWT writes; admin review listing |
| Users | `GET /users`, `GET /users/:id` | Admin |
| AI assistant | `POST /ai-agent/chat` with `{ "message": "Find a blue shirt" }` | Public; requires configured Gemini service |

Use Swagger and the module DTOs for detailed request bodies and query parameters. The checked-in Postman collection is available at [postmanCollections/ecom-nestjs-backend.json](postmanCollections/ecom-nestjs-backend.json); verify its saved URLs and credentials before running requests against your environment.

## Main application flows

### Catalog and media

Create categories and variant types/values, then create products referencing those IDs. Products can belong to multiple categories with one primary assignment. Products with options generate sellable variant combinations; products without options still have a default variant. Cart and order items reference variant IDs.

For images, an admin/seller requests a Cloudinary upload signature, uploads to Cloudinary, and supplies the uploaded media reference in the relevant create request. The backend verifies media before associating it. Product listing returns a primary image; detail returns all images and active variants.

### Shopping and checkout

Browse products, sign in, save a shipping address, and add variant quantities to the cart. Create an order using selected cart items or explicit `{ variantId, quantity }` items. An explicit shipping address must belong to the user; otherwise the service uses the default address, then the most recent address if no default exists. Currently checkout supports cash on delivery (`cod`); schema payment-provider enums do not imply implemented online payment integrations.

Orders support customer listing/detail/cancellation and admin/seller status management. Order confirmation email uses the Handlebars template in `src/templates/order-confirmation.hbs`.

### AI assistant

The AI module uses Gemini tool calls to search products and fetch product details from the database. The model ID is configured in `src/ai-agent/ai-agent.service.ts`. Model/service failures should be investigated separately from normal catalog API requests.

## Response conventions

Success responses are wrapped by the global interceptor:

```json
{
  "success": true,
  "method": "GET",
  "statusCode": 200,
  "message": "Products fetched successfully",
  "path": "/api/v1/products",
  "timestamp": "2026-11-19T10:00:00.000Z",
  "data": {
    "products": [],
    "meta": {
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 0,
        "totalPages": 0,
        "hasNextPage": false,
        "hasPreviousPage": false
      }
    }
  }
}
```

The `data` shape varies by endpoint. Errors contain `success: false`, `statusCode`, `message`, `path`, `timestamp`, and `method`, without the success data payload. Validation messages may be arrays. Development errors can include `errorDetails`.

Typical statuses: `400` invalid input, `401` authentication failure, `403` insufficient permissions, `404` missing resource, `409` conflict, and `500` backend failure. Prisma decimal prices serialize as strings; dates serialize as ISO strings.

## Commands and checks

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Development watch mode |
| `npm start` | Start through Nest CLI |
| `npm run start:debug` | Debug/watch mode |
| `npm run build` | Compile application |
| `npm test -- --runInBand` | Run Jest tests serially |
| `npm run test:watch` | Watch tests |
| `npm run test:cov` | Coverage report |
| `npm run lint` | ESLint with automatic fixes; modifies files |
| `npm run format` | Prettier formatting; modifies files |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma migrate deploy` | Apply committed migrations |
| `npm run seed` | Destructive development catalog seed described above |
| `npm run seed:dashboard` | Non-destructive dashboard demo-data seed |

Tests live alongside source files as `*.spec.ts`. Run `npm run test:e2e -- --runInBand` with `CHAT_TEST_DATABASE_URL` pointing to a test PostgreSQL database for the chat integration suite. It creates and removes an isolated schema; without that variable, the suite is skipped. See [Support chat API and frontend integration](docs/CHAT_API.md) for chat setup, media uploads, and Socket.IO events.

## Build and deployment

Install dependencies, configure the environment, generate Prisma, apply reviewed migrations, and build:

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
node dist/src/main.js
```

Set `NODE_ENV=production` through the deployment environment. The current compiled entry point is `dist/src/main.js`; the existing `start:prod` script targets `dist/main` and does not match this layout. Use the explicit command above until that script is updated.

Include the compiled output and runtime dependencies in the deployment. Mail templates are copied by the Nest asset configuration; check template availability in the deployed layout. The app currently calls `enableCors()` without an origin allowlist; configure the intended browser origins as part of deployment configuration changes.

## Repository layout

```text
src/
  auth/                 Signin, signup, tokens, profile, and JWT strategy
  category/             Category hierarchy
  product/              Catalog, filtering, variants, and product detail
  variant/              Shared variant types and values
  collection/           Product collections
  media/                Cloudinary integration
  wishlist/             User wishlist
  address/              Shipping addresses
  cart/                 Shopping cart
  order/                Checkout, orders, cancellation, and status changes
  review/               Product reviews
  user/                 Admin user reads
  ai-agent/             Gemini shopping assistant and tools
  mail/                 Email service
  templates/            Handlebars email templates
  common/               Guards, decorators, filters, and interceptors
  main.ts               Application bootstrap, validation, CORS, and Swagger
prisma/
  schema.prisma         Database models
  migrations/           Active migration history
  seed.ts               Development catalog seed
  prisma.service.ts     Prisma connection lifecycle
  prisma.module.ts      Shared database module
generated/prisma/       Generated Prisma client
postmanCollections/     Saved API collection
docs/                   Frontend handoff and database diagrams
specs/                  Feature specifications and planning artifacts
```

## Troubleshooting

- **Missing config at startup:** populate the environment variables above. Gemini, mail, and media modules initialize even when you only need product APIs.
- **Database connection or missing-table error:** confirm the database is reachable and apply the committed migrations to the intended database.
- **Missing generated client or stale schema types:** run `npx prisma generate`, then rebuild.
- **PostgreSQL Pool type mismatch:** avoid mixed package-manager dependency trees. The Prisma service passes pool configuration directly to `PrismaPg`, which owns pool creation and cleanup.
- **Product request returns 401:** omit the authorization header for guests; for signed-in users send a valid access token. An expired token does not fall back to guest mode.
- **Production start cannot find `dist/main`:** use `node dist/src/main.js` after building, as described above.
- **Empty catalog:** create products with an admin/seller account or intentionally seed a disposable development database.
- **Email, Cloudinary, or AI failure:** verify that provider's credentials and the failing service configuration.
