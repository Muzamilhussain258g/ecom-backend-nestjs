import { FunctionDeclaration, Type } from '@google/genai';

export const searchProductsDeclaration: FunctionDeclaration = {
  name: 'searchProducts',
  description:
    'Search the store catalog by keyword, category, color, and/or maximum price. Use this when the user asks what products are available.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Product search term (e.g. jeans, shoes, shirt)',
      },
      category: {
        type: Type.STRING,
        description: 'Category name or slug (e.g. Jeans, shirts)',
      },
      color: {
        type: Type.STRING,
        description: 'Color name (e.g. blue, green, red)',
      },
      maxPrice: {
        type: Type.NUMBER,
        description: 'Maximum price limit',
      },
    },
  },
};

export const getProductDetailsDeclaration: FunctionDeclaration = {
  name: 'getProductDetails',
  description:
    'Get detailed information for one product: available sizes, colors, prices, and stock. Use after searchProducts when the user asks about a specific product.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      productName: {
        type: Type.STRING,
        description: 'Product name to look up',
      },
    },
    required: ['productName'],
  },
};

export const geminiFunctionDeclarations: FunctionDeclaration[] = [
  searchProductsDeclaration,
  getProductDetailsDeclaration,
];
