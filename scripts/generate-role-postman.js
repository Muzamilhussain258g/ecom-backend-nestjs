const fs = require('fs');
const path = require('path');

const NGROK_ENDPOINT = 'https://palpitate-expend-epic.ngrok-free.dev/api/v1';

// Helper to create Postman request item
function createRequest({
  name,
  method,
  urlPath,
  queryParams = [],
  body = null,
  auth = null,
  testScript = null,
  description = ''
}) {
  const host = ['{{baseUrl}}'];
  const pathSegments = urlPath.split('/').filter(Boolean);

  let rawUrl = '{{baseUrl}}/' + pathSegments.join('/');
  if (queryParams.length > 0) {
    const qs = queryParams.map(q => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`).join('&');
    rawUrl += `?${qs}`;
  }

  const req = {
    name,
    request: {
      method,
      header: [
        ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
        { key: 'ngrok-skip-browser-warning', value: 'true', description: 'Bypasses ngrok free tier browser interstitial page' }
      ],
      url: {
        raw: rawUrl,
        host,
        path: pathSegments,
        ...(queryParams.length > 0 ? { query: queryParams } : {})
      },
      ...(description ? { description } : {})
    },
    response: []
  };

  if (auth) {
    req.request.auth = auth;
  }

  if (body) {
    req.request.body = {
      mode: 'raw',
      raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
      options: {
        raw: {
          language: 'json'
        }
      }
    };
  }

  if (testScript) {
    req.event = [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: testScript.split('\n')
        }
      }
    ];
  }

  return req;
}

// Bearer Auth helpers
const bearerAuth = (tokenVar = 'accessToken') => ({
  type: 'bearer',
  bearer: [
    {
      key: 'token',
      value: `{{${tokenVar}}}`,
      type: 'string'
    }
  ]
});

// Test script to save tokens
const saveTokensScript = (rolePrefix = '') => `
if (pm.response.code === 200 || pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    const token = data.accessToken;
    const refreshToken = data.refreshToken;
    
    if (token) {
        pm.collectionVariables.set('accessToken', token);
        ${rolePrefix ? `pm.collectionVariables.set('${rolePrefix}AccessToken', token);` : ''}
        console.log('Access token saved for ${rolePrefix || 'current user'}:', token);
    }
    if (refreshToken) {
        pm.collectionVariables.set('refreshToken', refreshToken);
        console.log('Refresh token saved');
    }
}
`.trim();

// Construct Collection
const collection = {
  info: {
    _postman_id: 'ecom-nestjs-role-based-api',
    name: 'E-Commerce Backend API (Role-Based)',
    description: 'Complete production-ready Postman collection for the NestJS E-Commerce backend service organized by Role (Public/Guest, Customer, Seller, and Admin). Configured with automatic token persistence, rich realistic payloads matching class-validator DTOs, and the ngrok live tunnel endpoint.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    {
      key: 'baseUrl',
      value: NGROK_ENDPOINT,
      type: 'string',
      description: 'Active API base URL (Defaulted to live ngrok endpoint)'
    },
    {
      key: 'accessToken',
      value: '',
      type: 'string',
      description: 'Customer or active user JWT access token'
    },
    {
      key: 'refreshToken',
      value: '',
      type: 'string',
      description: 'Active user JWT refresh token'
    },
    {
      key: 'sellerAccessToken',
      value: '',
      type: 'string',
      description: 'Dedicated JWT access token for Seller role'
    },
    {
      key: 'adminAccessToken',
      value: '',
      type: 'string',
      description: 'Dedicated JWT access token for Admin role'
    },
    {
      key: 'productId',
      value: '1',
      type: 'string'
    },
    {
      key: 'productSlug',
      value: 'classic-leather-wallet',
      type: 'string'
    },
    {
      key: 'variantId',
      value: '1',
      type: 'string'
    },
    {
      key: 'variantTypeId',
      value: '1',
      type: 'string'
    },
    {
      key: 'variantValueId',
      value: '1',
      type: 'string'
    },
    {
      key: 'categoryId',
      value: '1',
      type: 'string'
    },
    {
      key: 'collectionSlug',
      value: 'summer-fitness-essentials-2026',
      type: 'string'
    },
    {
      key: 'addressId',
      value: '1',
      type: 'string'
    },
    {
      key: 'cartItemId',
      value: '1',
      type: 'string'
    },
    {
      key: 'orderId',
      value: '1',
      type: 'string'
    },
    {
      key: 'reviewId',
      value: '1',
      type: 'string'
    },
    {
      key: 'mediaId',
      value: '1',
      type: 'string'
    }
  ],
  item: [
    // ==========================================
    // 1. PUBLIC / GUEST FOLDER
    // ==========================================
    {
      name: '🌐 1. Public / Guest (No Auth Required)',
      description: 'Endpoints accessible by unauthenticated visitors and storefront browsers, including account onboarding, catalogue browsing, search, and the AI shopping assistant.',
      item: [
        {
          name: 'Authentication (Public Onboarding)',
          item: [
            createRequest({
              name: 'Sign Up / Register User',
              method: 'POST',
              urlPath: 'auth/signup',
              body: {
                name: 'Alex Johnson',
                email: 'customer@example.com',
                password: 'Password123!'
              },
              testScript: saveTokensScript(),
              description: 'Creates a new customer user account. Password must be strong (min 8 chars, uppercase, lowercase, number, special char).'
            }),
            createRequest({
              name: 'Sign In / Login',
              method: 'POST',
              urlPath: 'auth/signin',
              body: {
                email: 'customer@example.com',
                password: 'Password123!'
              },
              testScript: saveTokensScript(),
              description: 'Authenticates user and returns JWT accessToken + refreshToken. Tokens are automatically stored in collection variables.'
            }),
            createRequest({
              name: 'Refresh Access Token',
              method: 'POST',
              urlPath: 'auth/refresh',
              body: {
                refreshToken: '{{refreshToken}}'
              },
              testScript: `
if (pm.response.code === 200) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.accessToken) {
        pm.collectionVariables.set('accessToken', data.accessToken);
        console.log('Access token refreshed:', data.accessToken);
    }
}
              `.trim(),
              description: 'Issues a new short-lived accessToken using a valid, non-revoked refreshToken.'
            }),
            createRequest({
              name: 'Sign Out / Logout',
              method: 'POST',
              urlPath: 'auth/signout',
              body: {
                refreshToken: '{{refreshToken}}'
              },
              description: 'Revokes the supplied refresh token in database.'
            })
          ]
        },
        {
          name: 'Products (Catalog Browsing)',
          item: [
            createRequest({
              name: 'List Products (with Search, Filter, Sort & Pagination)',
              method: 'GET',
              urlPath: 'products',
              queryParams: [
                { key: 'page', value: '1', description: 'Page number (default 1)' },
                { key: 'limit', value: '10', description: 'Items per page (max 100)' },
                { key: 'search', value: 'shoes', description: 'Optional text query matching name or description' },
                { key: 'category', value: 'footwear', description: 'Optional category slug filter' },
                { key: 'sortOrder', value: 'asc', description: 'Product name sort: asc or desc' }
              ],
              description: 'Public catalogue listing with pagination metadata and associated variants and primary media.'
            }),
            createRequest({
              name: 'Get Product Details by Slug',
              method: 'GET',
              urlPath: 'products/{{productSlug}}',
              description: 'Fetches complete product detail by unique slug, including all variants, variant options, prices, stock, categories, and media.'
            })
          ]
        },
        {
          name: 'Categories (Browsing)',
          item: [
            createRequest({
              name: 'List Categories (Hierarchy & Pagination)',
              method: 'GET',
              urlPath: 'categories',
              queryParams: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '20' },
                { key: 'depth', value: '2', description: 'Hierarchy depth (1-10)' }
              ],
              description: 'Retrieves active category tree with parent-child hierarchy and cover images.'
            }),
            createRequest({
              name: 'Get Category by ID',
              method: 'GET',
              urlPath: 'categories/{{categoryId}}',
              description: 'Retrieves single category details by numeric ID including children and media.'
            })
          ]
        },
        {
          name: 'Collections (Promotions & Curations)',
          item: [
            createRequest({
              name: 'List All Active Collections',
              method: 'GET',
              urlPath: 'collections',
              description: 'Public list of active curated collections with cover image and product previews.'
            }),
            createRequest({
              name: 'Get Collection by Slug',
              method: 'GET',
              urlPath: 'collections/{{collectionSlug}}',
              description: 'Fetches single collection by slug including ordered product listings.'
            })
          ]
        },
        {
          name: 'Product Reviews (Public View)',
          item: [
            createRequest({
              name: 'Get Reviews for Product',
              method: 'GET',
              urlPath: 'products/{{productId}}/reviews',
              queryParams: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '10' }
              ],
              description: 'Returns customer reviews and aggregate rating summary (total reviews, average stars, breakdown) for a product.'
            })
          ]
        },
        {
          name: 'AI Shopping Assistant',
          item: [
            createRequest({
              name: 'Chat with AI Shopping Assistant',
              method: 'POST',
              urlPath: 'ai-agent/chat',
              body: {
                message: 'Hello! I need a comfortable running shoe in size 9 under $150. What do you have?'
              },
              description: 'Natural language shopping assistant powered by Google Gemini that queries live store inventory.'
            })
          ]
        },
        {
          name: 'Health & Status',
          item: [
            createRequest({
              name: 'Server Welcome / Health Check',
              method: 'GET',
              urlPath: '',
              description: 'Basic health probe to verify API server reachability.'
            })
          ]
        }
      ]
    },

    // ==========================================
    // 2. CUSTOMER ROLE FOLDER
    // ==========================================
    {
      name: '👤 2. Customer Role (Authenticated Customer)',
      description: 'Endpoints used by authenticated shoppers: managing personal profiles, delivery addresses, shopping cart items, wishlist, order placement with COD checkout, and leaving reviews.',
      item: [
        {
          name: 'Customer Authentication & Profile',
          item: [
            createRequest({
              name: 'Sign In as Customer',
              method: 'POST',
              urlPath: 'auth/signin',
              body: {
                email: 'customer@example.com',
                password: 'Password123!'
              },
              testScript: saveTokensScript(),
              description: 'Logs in as a customer and saves the token to {{accessToken}}.'
            }),
            createRequest({
              name: 'Get My Profile (Current User)',
              method: 'GET',
              urlPath: 'auth/me',
              auth: bearerAuth('accessToken'),
              description: 'Fetches currently authenticated user identity (id, name, email, role).'
            }),
            createRequest({
              name: 'Update My Profile',
              method: 'PATCH',
              urlPath: 'auth/profile',
              auth: bearerAuth('accessToken'),
              body: {
                name: 'Alex Johnson Updated',
                email: 'alex.updated@example.com'
              },
              description: 'Updates customer full name or email.'
            }),
            createRequest({
              name: 'Change My Password',
              method: 'PATCH',
              urlPath: 'auth/password',
              auth: bearerAuth('accessToken'),
              body: {
                currentPassword: 'Password123!',
                newPassword: 'NewCustomerPassword456!'
              },
              description: 'Updates account password after verifying currentPassword.'
            })
          ]
        },
        {
          name: 'Shipping Addresses',
          item: [
            createRequest({
              name: 'List My Addresses',
              method: 'GET',
              urlPath: 'addresses',
              auth: bearerAuth('accessToken'),
              description: 'Retrieves all saved shipping addresses for current customer with default flag.'
            }),
            createRequest({
              name: 'Create Shipping Address (Home / Office / Other)',
              method: 'POST',
              urlPath: 'addresses',
              auth: bearerAuth('accessToken'),
              body: {
                label: 'home',
                fullName: 'Alex Johnson',
                phone: '+1-555-0199',
                street: '123 Elm Street, Apt 4B',
                city: 'Metropolis',
                province: 'Central State',
                postalCode: '10001',
                country: 'United States',
                isDefault: true
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('addressId', String(data.id));
        console.log('Saved addressId:', data.id);
    }
}
              `.trim(),
              description: 'Adds a new delivery address. Label must be one of: home, office, other.'
            }),
            createRequest({
              name: 'Get Address by ID',
              method: 'GET',
              urlPath: 'addresses/{{addressId}}',
              auth: bearerAuth('accessToken'),
              description: 'Retrieves a single address belonging to current customer.'
            }),
            createRequest({
              name: 'Update Shipping Address',
              method: 'PATCH',
              urlPath: 'addresses/{{addressId}}',
              auth: bearerAuth('accessToken'),
              body: {
                label: 'office',
                fullName: 'Alex Johnson',
                phone: '+1-555-0199',
                street: '789 Business Parkway, Suite 300',
                city: 'Metropolis',
                province: 'Central State',
                postalCode: '10002',
                country: 'United States',
                isDefault: false
              },
              description: 'Updates fields on an existing shipping address.'
            }),
            createRequest({
              name: 'Delete Shipping Address',
              method: 'DELETE',
              urlPath: 'addresses/{{addressId}}',
              auth: bearerAuth('accessToken'),
              description: 'Deletes a shipping address belonging to current customer.'
            })
          ]
        },
        {
          name: 'Shopping Cart',
          item: [
            createRequest({
              name: 'Get My Cart',
              method: 'GET',
              urlPath: 'cart',
              auth: bearerAuth('accessToken'),
              description: 'Retrieves customer cart, selected items, item quantities, prices, subtotal, and stock validation.'
            }),
            createRequest({
              name: 'Add Item to Cart',
              method: 'POST',
              urlPath: 'cart/items',
              auth: bearerAuth('accessToken'),
              body: {
                variantId: 1,
                buyingQuantity: 2,
                isSelected: true
              },
              testScript: `
if (pm.response.code === 200) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.items && data.items.length > 0) {
        pm.collectionVariables.set('cartItemId', String(data.items[0].id));
    }
}
              `.trim(),
              description: 'Adds a specific product variant to the customer cart.'
            }),
            createRequest({
              name: 'Update Cart Item (Quantity or Selection)',
              method: 'PATCH',
              urlPath: 'cart/items/{{cartItemId}}',
              auth: bearerAuth('accessToken'),
              body: {
                buyingQuantity: 3,
                isSelected: true
              },
              description: 'Updates buying quantity or toggles checkout selection checkbox.'
            }),
            createRequest({
              name: 'Remove Item from Cart',
              method: 'DELETE',
              urlPath: 'cart/items/{{cartItemId}}',
              auth: bearerAuth('accessToken'),
              description: 'Removes an individual item line from the cart.'
            }),
            createRequest({
              name: 'Clear Entire Cart',
              method: 'DELETE',
              urlPath: 'cart/clear',
              auth: bearerAuth('accessToken'),
              description: 'Empties all items from the customer active cart.'
            })
          ]
        },
        {
          name: 'Wishlist',
          item: [
            createRequest({
              name: 'Get My Wishlist',
              method: 'GET',
              urlPath: 'wishlist',
              auth: bearerAuth('accessToken'),
              queryParams: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '20' }
              ],
              description: 'Returns customer wishlist items with product information and prices.'
            }),
            createRequest({
              name: 'Add Product to Wishlist',
              method: 'POST',
              urlPath: 'wishlist/{{productId}}',
              auth: bearerAuth('accessToken'),
              description: 'Adds a product to customer wishlist by numeric productId in path.'
            }),
            createRequest({
              name: 'Remove Product from Wishlist',
              method: 'DELETE',
              urlPath: 'wishlist/{{productId}}',
              auth: bearerAuth('accessToken'),
              description: 'Removes product from wishlist.'
            })
          ]
        },
        {
          name: 'Orders (COD Checkout)',
          item: [
            createRequest({
              name: 'Place Order (Checkout Selected Cart Items)',
              method: 'POST',
              urlPath: 'orders',
              auth: bearerAuth('accessToken'),
              body: {
                shippingAddressId: 1,
                paymentGateway: 'cod'
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('orderId', String(data.id));
        console.log('Created orderId:', data.id);
    }
}
              `.trim(),
              description: 'Places a Cash on Delivery (COD) order using currently selected cart items. Stock is atomically decremented and cart items removed.'
            }),
            createRequest({
              name: 'Place Direct Order (Specific Items Checkout)',
              method: 'POST',
              urlPath: 'orders',
              auth: bearerAuth('accessToken'),
              body: {
                shippingAddressId: 1,
                paymentGateway: 'cod',
                items: [
                  {
                    variantId: 1,
                    quantity: 2
                  }
                ]
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('orderId', String(data.id));
    }
}
              `.trim(),
              description: 'Direct checkout bypassing cart (Buy Now) by passing explicit items array.'
            }),
            createRequest({
              name: 'List My Orders',
              method: 'GET',
              urlPath: 'orders',
              auth: bearerAuth('accessToken'),
              queryParams: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '10' },
                { key: 'status', value: 'pending', description: 'Optional status filter: pending, confirmed, processing, shipped, delivered, cancelled, returned' }
              ],
              description: 'Fetches paginated order history for current customer.'
            }),
            createRequest({
              name: 'Get My Order by ID',
              method: 'GET',
              urlPath: 'orders/{{orderId}}',
              auth: bearerAuth('accessToken'),
              description: 'Returns full order breakdown with item snapshot, tracking, and shipping address snapshot.'
            }),
            createRequest({
              name: 'Cancel Pending Order',
              method: 'PATCH',
              urlPath: 'orders/{{orderId}}/cancel',
              auth: bearerAuth('accessToken'),
              description: 'Allows customer to cancel an order as long as status is still "pending". Automatically restocks inventory.'
            })
          ]
        },
        {
          name: 'Reviews',
          item: [
            createRequest({
              name: 'Submit Product Review',
              method: 'POST',
              urlPath: 'products/{{productId}}/reviews',
              auth: bearerAuth('accessToken'),
              body: {
                stars: 5,
                review: 'Outstanding quality and very fast shipping! Fits perfectly.'
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('reviewId', String(data.id));
    }
}
              `.trim(),
              description: 'Submits a verified product rating (1 to 5 stars) and optional review text. One review per user per product.'
            }),
            createRequest({
              name: 'Update My Review',
              method: 'PATCH',
              urlPath: 'reviews/{{reviewId}}',
              auth: bearerAuth('accessToken'),
              body: {
                stars: 4,
                review: 'Still holding up great after several weeks of continuous use.'
              },
              description: 'Updates the user own review rating or text feedback.'
            }),
            createRequest({
              name: 'Delete My Review',
              method: 'DELETE',
              urlPath: 'reviews/{{reviewId}}',
              auth: bearerAuth('accessToken'),
              description: 'Deletes the user own review.'
            })
          ]
        }
      ]
    },

    // ==========================================
    // 3. SELLER ROLE FOLDER
    // ==========================================
    {
      name: '🏪 3. Seller Role (Vendor / Merchant)',
      description: 'Operations permitted for seller accounts: managing variant types, variant values, creating & updating products, inventory & pricing adjustments, generating Cloudinary upload signatures, and processing store orders.',
      item: [
        {
          name: 'Seller Authentication',
          item: [
            createRequest({
              name: 'Sign In as Seller',
              method: 'POST',
              urlPath: 'auth/signin',
              body: {
                email: 'seller@example.com',
                password: 'Password123!'
              },
              testScript: saveTokensScript('seller'),
              description: 'Authenticates a seller and sets both {{sellerAccessToken}} and {{accessToken}}.'
            })
          ]
        },
        {
          name: 'Variant Types (Seller Only)',
          item: [
            createRequest({
              name: 'List All Variant Types',
              method: 'GET',
              urlPath: 'variant-types',
              description: 'Public/seller list of variant types (e.g., Color, Size, Storage).'
            }),
            createRequest({
              name: 'Create Variant Type',
              method: 'POST',
              urlPath: 'variant-types',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                name: 'Color',
                sortOrder: 1
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('variantTypeId', String(data.id));
        console.log('Saved variantTypeId:', data.id);
    }
}
              `.trim(),
              description: 'Restricted to Seller. Creates a new variant type.'
            }),
            createRequest({
              name: 'Update Variant Type',
              method: 'PATCH',
              urlPath: 'variant-types/{{variantTypeId}}',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                name: 'Primary Color',
                sortOrder: 2
              },
              description: 'Restricted to Seller. Updates name or sorting order.'
            }),
            createRequest({
              name: 'Delete Variant Type',
              method: 'DELETE',
              urlPath: 'variant-types/{{variantTypeId}}',
              auth: bearerAuth('sellerAccessToken'),
              description: 'Restricted to Seller. Deletes variant type if not linked to active products.'
            }),
            createRequest({
              name: 'Add Value to Variant Type',
              method: 'POST',
              urlPath: 'variant-types/{{variantTypeId}}/values',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                value: 'Midnight Black',
                code: 'MIDNIGHT-BLACK',
                metadata: {
                  hex: '#111111'
                },
                sortOrder: 1
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('variantValueId', String(data.id));
    }
}
              `.trim(),
              description: 'Creates a new value under variant type. Code must match uppercase alphanumeric hyphenated pattern.'
            }),
            createRequest({
              name: 'List Values by Variant Type',
              method: 'GET',
              urlPath: 'variant-types/{{variantTypeId}}/values',
              description: 'Returns all available values for a variant type.'
            }),
            createRequest({
              name: 'Delete All Values for Variant Type',
              method: 'DELETE',
              urlPath: 'variant-types/{{variantTypeId}}/values',
              auth: bearerAuth('sellerAccessToken'),
              description: 'Removes all values under the variant type.'
            })
          ]
        },
        {
          name: 'Variant Values (Seller Only)',
          item: [
            createRequest({
              name: 'List All Variant Values across Catalog',
              method: 'GET',
              urlPath: 'variant-values',
              description: 'Returns all registered variant values.'
            }),
            createRequest({
              name: 'Update Variant Value by ID',
              method: 'PATCH',
              urlPath: 'variant-values/{{variantValueId}}',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                value: 'Matte Jet Black',
                code: 'MATTE-JET-BLACK',
                metadata: {
                  hex: '#0a0a0a'
                },
                sortOrder: 1
              },
              description: 'Updates value name, code, metadata, or sortOrder.'
            }),
            createRequest({
              name: 'Delete Single Variant Value',
              method: 'DELETE',
              urlPath: 'variant-values/{{variantValueId}}',
              auth: bearerAuth('sellerAccessToken'),
              description: 'Deletes an individual variant value.'
            })
          ]
        },
        {
          name: 'Product Management (Seller)',
          item: [
            createRequest({
              name: 'Create Simple Product (No Variants)',
              method: 'POST',
              urlPath: 'products',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                name: 'Premium Leather Wallet',
                description: 'Genuine full-grain leather bifold wallet with RFID protection.',
                basePrice: 49.99,
                hasVariants: false,
                stock: 50,
                categories: [
                  {
                    categoryId: 1,
                    isPrimary: true
                  }
                ],
                media: [
                  {
                    providerPublicId: 'ecommerce/products/wallet-front',
                    version: 1700000001,
                    signature: 'mock_signature_from_upload',
                    format: 'webp',
                    bytes: 185000,
                    width: 1200,
                    height: 1200,
                    isPrimary: true,
                    position: 0,
                    altText: 'Front angle of premium leather wallet'
                  }
                ]
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('productId', String(data.id));
        if (data.slug) pm.collectionVariables.set('productSlug', data.slug);
    }
}
              `.trim(),
              description: 'Creates a simple standalone product with fixed base stock and base price.'
            }),
            createRequest({
              name: 'Create Product with Variants & Matrix',
              method: 'POST',
              urlPath: 'products',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                name: 'Pro Breathable Running Shoes',
                description: 'Lightweight high-mileage road running sneakers with carbon rubber outsole.',
                basePrice: 129.99,
                hasVariants: true,
                categories: [
                  {
                    categoryId: 1,
                    isPrimary: true
                  }
                ],
                variantSelections: [
                  {
                    variantTypeId: 1,
                    variantValueIds: [1, 2]
                  },
                  {
                    variantTypeId: 2,
                    variantValueIds: [3, 4]
                  }
                ],
                variantQuantities: [
                  {
                    variantValueIds: [1, 3],
                    quantity: 20
                  },
                  {
                    variantValueIds: [1, 4],
                    quantity: 25
                  },
                  {
                    variantValueIds: [2, 3],
                    quantity: 15
                  },
                  {
                    variantValueIds: [2, 4],
                    quantity: 30
                  }
                ],
                media: [
                  {
                    providerPublicId: 'ecommerce/products/shoe-black',
                    version: 1700000002,
                    signature: 'mock_signature_from_upload',
                    format: 'webp',
                    bytes: 290000,
                    width: 1400,
                    height: 1400,
                    isPrimary: true,
                    position: 0,
                    altText: 'Running Shoe in Black colorway',
                    variantValueId: 1
                  }
                ]
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('productId', String(data.id));
        if (data.slug) pm.collectionVariables.set('productSlug', data.slug);
        if (data.variants && data.variants.length > 0) {
            pm.collectionVariables.set('variantId', String(data.variants[0].id));
        }
    }
}
              `.trim(),
              description: 'Creates product with multi-dimensional variant matrix (e.g. Color x Size) and initial stock allocation.'
            }),
            createRequest({
              name: 'Update Product Details',
              method: 'PATCH',
              urlPath: 'products/{{productId}}',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                name: 'Pro Breathable Running Shoes v2',
                description: 'Upgraded version 2 with responsive nitrogen-infused foam midsole.',
                basePrice: 139.99,
                productStatus: true,
                categories: [
                  {
                    categoryId: 1,
                    isPrimary: true
                  }
                ]
              },
              description: 'Updates product level metadata, pricing, status, and category linkages.'
            }),
            createRequest({
              name: 'Update Product Variant Matrix Options',
              method: 'PUT',
              urlPath: 'products/{{productId}}/variant-options',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                variantSelections: [
                  {
                    variantTypeId: 1,
                    variantValueIds: [1, 2, 5]
                  }
                ]
              },
              description: 'Rebuilds product variant matrix combinations with new option values.'
            }),
            createRequest({
              name: 'Update Specific Variant (SKU, Price, Stock & Status)',
              method: 'PATCH',
              urlPath: 'products/{{productId}}/variants/{{variantId}}',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                sku: 'PRO-RUN-BLK-US9',
                price: 134.99,
                stock: 40,
                isActive: true
              },
              description: 'Updates price override, stock inventory, or SKU for a single product variant.'
            })
          ]
        },
        {
          name: 'Media Upload & Signatures',
          item: [
            createRequest({
              name: 'Generate Cloudinary Upload Signature (Product Image)',
              method: 'POST',
              urlPath: 'media/upload-signature',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                purpose: 'product'
              },
              description: 'Generates secure Cloudinary pre-signed upload parameters for direct client-side asset uploads.'
            }),
            createRequest({
              name: 'Delete Media by ID',
              method: 'DELETE',
              urlPath: 'media/{{mediaId}}',
              auth: bearerAuth('sellerAccessToken'),
              description: 'Deletes media record and removes remote asset from Cloudinary.'
            })
          ]
        },
        {
          name: 'Order Fulfillment (Seller/Merchant)',
          item: [
            createRequest({
              name: 'List Orders for Store (with Filters)',
              method: 'GET',
              urlPath: 'orders/admin/all',
              auth: bearerAuth('sellerAccessToken'),
              queryParams: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '20' },
                { key: 'status', value: 'pending', description: 'Filter: pending, confirmed, processing, shipped, delivered, cancelled, returned' }
              ],
              description: 'Seller/Admin order dashboard listing all customer orders.'
            }),
            createRequest({
              name: 'Update Order Status (Confirm / Ship / Deliver / Cancel)',
              method: 'PATCH',
              urlPath: 'orders/admin/{{orderId}}/status',
              auth: bearerAuth('sellerAccessToken'),
              body: {
                status: 'confirmed'
              },
              description: 'Fulfills order lifecycle: pending -> confirmed -> processing -> shipped -> delivered. Marks COD payment as success on delivery; automatically restocks on cancel/return.'
            })
          ]
        }
      ]
    },

    // ==========================================
    // 4. ADMIN ROLE FOLDER
    // ==========================================
    {
      name: '🛡️ 4. Admin Role (Super Admin / Operations)',
      description: 'Endpoints restricted to administrative staff: category creation and management, curated collection management, cross-store order oversight, review moderation, and full product catalogue control.',
      item: [
        {
          name: 'Admin Authentication',
          item: [
            createRequest({
              name: 'Sign In as Admin',
              method: 'POST',
              urlPath: 'auth/signin',
              body: {
                email: 'admin@example.com',
                password: 'Password123!'
              },
              testScript: saveTokensScript('admin'),
              description: 'Authenticates administrator and populates {{adminAccessToken}} and {{accessToken}}.'
            })
          ]
        },
        {
          name: 'Category Management (Admin)',
          item: [
            createRequest({
              name: 'Create Category',
              method: 'POST',
              urlPath: 'categories',
              auth: bearerAuth('adminAccessToken'),
              body: {
                categoryName: 'Apparel & Fashion',
                parentId: null,
                image: {
                  providerPublicId: 'ecommerce/categories/apparel-cover',
                  version: 1700000005,
                  signature: 'mock_signature_from_upload',
                  format: 'webp',
                  bytes: 140000,
                  width: 800,
                  height: 600,
                  altText: 'Apparel & Fashion category banner'
                }
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.id) {
        pm.collectionVariables.set('categoryId', String(data.id));
    }
}
              `.trim(),
              description: 'Creates a top-level category or subcategory with optional cover image.'
            }),
            createRequest({
              name: 'Create Subcategory',
              method: 'POST',
              urlPath: 'categories',
              auth: bearerAuth('adminAccessToken'),
              body: {
                categoryName: 'Men Footwear',
                parentId: 1,
                image: {
                  providerPublicId: 'ecommerce/categories/men-footwear',
                  version: 1700000006,
                  signature: 'mock_signature_from_upload',
                  format: 'webp',
                  bytes: 120000,
                  width: 800,
                  height: 600,
                  altText: 'Men Footwear subcategory'
                }
              },
              description: 'Creates a nested subcategory under an existing parentId.'
            }),
            createRequest({
              name: 'Update Category',
              method: 'PATCH',
              urlPath: 'categories/{{categoryId}}',
              auth: bearerAuth('adminAccessToken'),
              body: {
                categoryName: 'Footwear & Athletic Shoes',
                parentId: null
              },
              description: 'Updates category name or re-parents under another category.'
            }),
            createRequest({
              name: 'Delete Category',
              method: 'DELETE',
              urlPath: 'categories/{{categoryId}}',
              auth: bearerAuth('adminAccessToken'),
              description: 'Deletes category. Throws error if category has associated products.'
            })
          ]
        },
        {
          name: 'Collection Management (Admin)',
          item: [
            createRequest({
              name: 'Create Curated Collection (with Ranked Products & Banner)',
              method: 'POST',
              urlPath: 'collections',
              auth: bearerAuth('adminAccessToken'),
              body: {
                name: 'Summer Fitness Essentials 2026',
                description: 'Featured performance gear, athletic apparel, and footwear for warm weather training.',
                isActive: true,
                products: [
                  {
                    productId: 1,
                    position: 0
                  },
                  {
                    productId: 2,
                    position: 1
                  }
                ],
                coverImage: {
                  providerPublicId: 'ecommerce/collections/summer-fitness-cover',
                  version: 1700000007,
                  signature: 'mock_signature_from_upload',
                  format: 'webp',
                  bytes: 350000,
                  width: 1920,
                  height: 720,
                  altText: 'Summer Fitness promotional hero banner'
                }
              },
              testScript: `
if (pm.response.code === 201) {
    const res = pm.response.json();
    const data = res.data || res;
    if (data.slug) {
        pm.collectionVariables.set('collectionSlug', data.slug);
    }
}
              `.trim(),
              description: 'Creates a homepage or promotional collection linked to ordered products.'
            })
          ]
        },
        {
          name: 'Media Signatures (Admin)',
          item: [
            createRequest({
              name: 'Generate Signature for Category Image',
              method: 'POST',
              urlPath: 'media/upload-signature',
              auth: bearerAuth('adminAccessToken'),
              body: {
                purpose: 'category'
              },
              description: 'Generates Cloudinary upload signature for category media asset.'
            }),
            createRequest({
              name: 'Generate Signature for Collection Cover',
              method: 'POST',
              urlPath: 'media/upload-signature',
              auth: bearerAuth('adminAccessToken'),
              body: {
                purpose: 'collection'
              },
              description: 'Generates Cloudinary upload signature for collection promotional cover.'
            }),
            createRequest({
              name: 'Delete Any Media Record',
              method: 'DELETE',
              urlPath: 'media/{{mediaId}}',
              auth: bearerAuth('adminAccessToken'),
              description: 'Admin deletion of any media asset.'
            })
          ]
        },
        {
          name: 'Order Oversight (Admin)',
          item: [
            createRequest({
              name: 'List All Orders Across Store (with Customer & Status Filter)',
              method: 'GET',
              urlPath: 'orders/admin/all',
              auth: bearerAuth('adminAccessToken'),
              queryParams: [
                { key: 'page', value: '1' },
                { key: 'limit', value: '50' },
                { key: 'status', value: 'pending' },
                { key: 'userId', value: '1', description: 'Optional customer ID filter' }
              ],
              description: 'Super-admin order query across all customers in the system.'
            }),
            createRequest({
              name: 'Get Any Order Details by ID',
              method: 'GET',
              urlPath: 'orders/{{orderId}}',
              auth: bearerAuth('adminAccessToken'),
              description: 'Admins can inspect full details of any customer order.'
            }),
            createRequest({
              name: 'Update Order Status as Admin',
              method: 'PATCH',
              urlPath: 'orders/admin/{{orderId}}/status',
              auth: bearerAuth('adminAccessToken'),
              body: {
                status: 'delivered'
              },
              description: 'Updates order status. Transitions to "delivered" automatically marks Cash on Delivery payment as success.'
            })
          ]
        },
        {
          name: 'Review Moderation (Admin)',
          item: [
            createRequest({
              name: 'Delete Inappropriate Review as Admin',
              method: 'DELETE',
              urlPath: 'reviews/{{reviewId}}',
              auth: bearerAuth('adminAccessToken'),
              description: 'Allows an administrator to delete any abusive, spam, or inappropriate review across any product.'
            })
          ]
        }
      ]
    }
  ]
};

const outputPath = path.join(__dirname, '..', 'postmanCollections', 'ecom-nestjs-backend.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), 'utf-8');
console.log(`Successfully generated role-based Postman collection at: ${outputPath}`);
