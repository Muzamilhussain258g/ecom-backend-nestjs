export type SearchProductsArgs = {
  query?: string;
  category?: string;
  color?: string;
  maxPrice?: number;
};

export type GetProductDetailsArgs = {
  productName: string;
};

export type AiToolName = 'searchProducts' | 'getProductDetails';
