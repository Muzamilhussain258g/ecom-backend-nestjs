# Frontend Products API Guide

Both product endpoints support guest and authenticated requests. Login is optional for browsing. A valid access token adds the current user's wishlist state to the response.

Base URL for local development: `http://localhost:3000/api/v1` (replace host/port for your environment).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/products` | Product listing with filters and pagination |
| GET | `/products/:slug` | Product detail; use the product **slug**, not its numeric ID |

Both endpoints return only products with `productStatus: true`, including when called by an admin or seller. No role restriction applies to these GET endpoints.

## Token behavior

| Request | Behavior | Wishlist field |
| --- | --- | --- |
| No `Authorization` header | Guest request; products can be fetched | `isWishlisted` is omitted |
| `Authorization: Bearer <valid-access-token>` | Token and user are validated; products can be fetched | `isWishlisted: true` or `false` on each product |
| Expired or invalid token | `401 Unauthorized`; no product response | Not returned |
| Malformed header, e.g. `Basic token` or `Bearer` | `401 Unauthorized` | Not returned |
| Validly verified token for a user that no longer exists | `401 Unauthorized` | Not returned |

Use the access token, not the refresh token. Header format must be exactly `Bearer <token>` with one space, capital `B`, and no extra segments. For guests, omit the header entirely; do not send `Bearer null` or `Bearer undefined`. These routes do not read tokens from cookies or query parameters.

### Without a token

1. Frontend sends the GET request without an authorization header.
2. The optional auth guard allows the request without authenticating a user.
3. Backend fetches active products using the requested filters, or the requested slug.
4. Backend skips the user wishlist lookup and returns the product data without `isWishlisted`.

### With a token

1. Frontend sends `Authorization: Bearer <accessToken>`.
2. Backend validates the header, JWT signature and expiry, access-token type, user ID, and user existence.
3. If authentication fails, the request stops with `401`; it does **not** automatically become a guest request.
4. Backend fetches the same public product data and checks the authenticated user's wishlist.
5. Each returned product receives `isWishlisted: true` if saved by that user, otherwise `false`. This does not filter the list to only wishlisted products.

## Listing filters

All query parameters are optional and behave the same with or without authentication.

| Parameter | Accepted value / behavior | Default |
| --- | --- | --- |
| `page` | Integer >= 1 | `1` |
| `limit` | Integer from 1 to 100 | `10` |
| `search` | Nonempty string, up to 100 characters after trimming; case-insensitive match in name or description | No search filter |
| `category` | Category **slug**; trimmed and lowercased, nonempty, max 100 characters; matches an assigned category | No category filter |
| `minPrice` | Number >= 0, max 2 decimal places; inclusive minimum `basePrice` | No minimum |
| `maxPrice` | Number >= 0, max 2 decimal places; inclusive maximum `basePrice`, must be >= `minPrice` | No maximum |
| `inStock` | Literal `true` or `false`; true means at least one active variant has stock > 0; false means none does | No stock filter |
| `sortBy` | `name`, `price`, or `createdAt`; price uses `basePrice` | `createdAt`, except when only `sortOrder` is supplied, then `name` |
| `sortOrder` | `asc` or `desc` | `desc` |

Default ordering is newest first (`createdAt desc`). Ties use `id desc`. Send both sorting parameters explicitly for predictable UI behavior. Category matching does not automatically include child categories. Price filters/sorting use product base price, not individual variant prices.

Example:

```http
GET /api/v1/products?page=1&limit=12&search=shirt&category=clothing&minPrice=500&maxPrice=5000&inStock=true&sortBy=price&sortOrder=asc
```

## Response structure

The following examples use illustrative data and show selected product fields. Other returned fields are described below. Dates are ISO strings; Prisma decimal prices serialize as strings.

### Guest listing — HTTP 200

```json
{
  "success": true,
  "method": "GET",
  "statusCode": 200,
  "message": "Products fetched successfully",
  "path": "/api/v1/products?page=1&limit=10",
  "timestamp": "2026-11-19T10:00:00.000Z",
  "data": {
    "products": [
      {
        "id": 12,
        "name": "Cotton Shirt",
        "slug": "cotton-shirt",
        "basePrice": "1500",
        "productStatus": true,
        "hasVariants": true,
        "productCategories": [],
        "images": []
      }
    ],
    "meta": {
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPreviousPage": false
      }
    }
  }
}
```

For an authenticated listing, the envelope stays the same and **each product** additionally contains:

```json
{ "isWishlisted": true }
```

The value is `false` for products not in that user's wishlist. Guest omission means wishlist state was not checked, not that the backend confirmed `false`.

Read products from `body.data.products` and pagination from `body.data.meta.pagination`. No matches returns `200` with `products: []`, `total: 0`, and `totalPages: 0`. A page beyond the last page also returns an empty array.

Listing items include product scalar fields, `productCategories` (each has `isPrimary` and nested `category` with `id`, `categoryName`, `slug`, `parentId`), and at most one primary image. An image has `id`, `isPrimary`, `position`, `altText`, nested `media` (use `media.url`), and nullable `variantValue`. If there is no primary image, `images` is empty. Listing items do not include variant inventory/options or review summaries; fetch detail for these.

### Product detail — HTTP 200

```http
GET /api/v1/products/cotton-shirt
Authorization: Bearer <accessToken>
```

The envelope is the same, with message `Product fetched successfully` and the product directly at `body.data` (not `body.data.products`). Detail includes:

| Field | Meaning |
| --- | --- |
| `id`, `name`, `slug`, `description`, `basePrice` | Product information |
| `productStatus`, `hasVariants`, `createdAt`, `updatedAt` | Status and metadata |
| `productCategories` | Assigned categories with primary flag and nested category |
| `images` | All product images; primary images first, then ID ascending; URL at `image.media.url` |
| `variantOptions` | Variant types with their available `values`; values include `productVariantValueId` |
| `variants` | Active variants only, with `id`, `sku`, `price`, `stock`, `isActive`, `combinationKey`, and `values` |
| `reviews` | `{ averageRating, totalReviews, items }`; items are the latest 5 by ID, with `id`, `review`, `stars`, and user `{ id, name }` |
| `isWishlisted` | Boolean only when authenticated; omitted for guests |

Out-of-stock active variants can still appear in detail. With no reviews, `averageRating` and `totalReviews` are `0`, and `items` is empty. A missing or inactive product returns `404`.

## Frontend request example

```ts
const API_BASE_URL = 'http://localhost:3000/api/v1';

async function getProductsResource(
  path: string,
  accessToken?: string | null,
) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  const body = await response.json();

  if (!response.ok) {
    // Handle 401 through your app's session/refresh flow.
    // Do not keep retrying with the same invalid token.
    throw Object.assign(new Error(
      Array.isArray(body.message) ? body.message.join(', ') : body.message,
    ), { status: response.status });
  }
  return body.data;
}

// Guest listing: no Authorization header.
const guestListing = await getProductsResource('/products?page=1&limit=10');

// Logged-in listing: accessToken is obtained from your app's auth state.
const listing = await getProductsResource('/products?page=1&limit=10', accessToken);
const products = listing.products;
const pagination = listing.meta.pagination;

// Detail uses slug, not numeric ID.
const product = await getProductsResource(
  `/products/${encodeURIComponent(slug)}`,
  accessToken,
);
const showFilledHeart = product.isWishlisted === true;
```

## Error handling and UI flow

| Status | Meaning | Frontend action |
| --- | --- | --- |
| `400` | Invalid query parameters | Correct filters; `message` can be an array of validation messages |
| `401` | Supplied token/header is invalid, expired, wrong token type, or user is missing | Run the app's auth recovery flow; if continuing as guest, explicitly retry without the authorization header |
| `404` | Detail slug does not match an active product | Show product-not-found state |
| `500` | Backend/database failure | Show a retryable error state |

Example expired/invalid token response:

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid or expired token",
  "path": "/api/v1/products",
  "timestamp": "2026-11-19T10:00:00.000Z",
  "method": "GET"
}
```

Other auth messages include `Invalid authorization header format`, `An access token is required`, and `User not found`. Use the HTTP status for control flow rather than matching message text. Error responses do not contain the success `data` payload.

Recommended frontend behavior:

1. Guest opens products: fetch without a token; show an unfilled wishlist icon. On wishlist click, prompt login.
2. Logged-in user opens products: send the access token; render the icon using `isWishlisted === true`.
3. Login, logout, or account switch: invalidate/refetch product list and detail caches. Include user identity or guest state in cache keys so one user's wishlist state is not shown to another.
4. Wishlist add/remove succeeds: update or invalidate both listing and detail caches. Product GET requests only read wishlist state; they never add/remove items.

Wishlist writes require authentication: `POST /api/v1/wishlist/:productId` adds an item and `DELETE /api/v1/wishlist/:productId` removes it. These paths use the numeric product ID, unlike the product detail route, which uses a slug.

## Implementation references

This handoff describes the current repository implementation:

- `src/main.ts` — `/api/v1` prefix.
- `src/product/product.controller.ts` — routes and optional authentication.
- `src/product/product.service.ts` — filtering, response data, and wishlist enrichment.
- `src/product/dto/get-all-products.dto.ts` — query validation and defaults.
- `src/common/guards/jwt-auth.guard.ts` and `src/auth/strategies/jwt.strategy.ts` — token validation.
- `src/common/interceptors/transform.interceptor.ts` and `src/common/filters/http-exception.filter.ts` — response envelopes.
