import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  createPartFromFunctionResponse,
  FunctionCall,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { geminiFunctionDeclarations } from './tools/gemini-tools';
import {
  AiToolName,
  GetProductDetailsArgs,
  SearchProductsArgs,
} from './types/tool-args.type';

const SEARCH_LIMIT = 5;
const MAX_TOOL_ROUNDS = 5;
const MODEL_ID = 'gemini-3.8-flash';

const SYSTEM_INSTRUCTION = `You are an AI e-commerce shopping assistant.
Help users find products, check available colors and sizes, prices, and stock.
Always use tools for product-related questions. Be concise, helpful, and polite.
If tools return no matching products, say so clearly and suggest refining the search.`;

const variantValueSelect = {
  value: true,
  variantType: {
    select: { name: true, slug: true },
  },
} satisfies Prisma.VariantValueSelect;

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly genAI: GoogleGenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async handleUserQuery(userMessage: string, history: Content[] = []) {
    const contents: Content[] = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    let response = await this.generate(contents);
    let functionCalls = response.functionCalls ?? [];
    let rounds = 0;

    while (functionCalls.length > 0 && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent?.parts?.length) {
        // Keep full model parts (incl. thought signatures) for Gemini 3.x.
        contents.push({
          role: 'model',
          parts: modelContent.parts,
        });
      }

      const functionResponseParts: Part[] = [];
      for (const call of functionCalls) {
        const name = call.name;
        if (!name) {
          continue;
        }

        const callId = call.id ?? name;
        const toolResult = await this.executeTool(call);

        functionResponseParts.push(
          createPartFromFunctionResponse(callId, name, {
            result: toolResult,
          }),
        );
      }

      if (!functionResponseParts.length) {
        break;
      }

      // Gemini 3.x rejects role "function"; send tool results as "user".
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      response = await this.generate(contents);
      functionCalls = response.functionCalls ?? [];
    }

    if (functionCalls.length > 0) {
      this.logger.warn(
        `Stopped after ${MAX_TOOL_ROUNDS} tool rounds; returning partial reply`,
      );
    }

    const reply = response.text?.trim();
    if (!reply) {
      throw new ServiceUnavailableException(
        'AI assistant could not produce a response. Please try again.',
      );
    }

    return { reply };
  }

  private generate(contents: Content[]): Promise<GenerateContentResponse> {
    return this.genAI.models.generateContent({
      model: MODEL_ID,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: geminiFunctionDeclarations }],
      },
    });
  }

  private async executeTool(call: FunctionCall): Promise<unknown> {
    const name = call.name as AiToolName | undefined;
    const args = (call.args ?? {}) as Record<string, unknown>;

    this.logger.log(`Tool call: ${name} args=${JSON.stringify(args)}`);

    if (!name) {
      return { error: 'Tool call is missing a function name' };
    }

    try {
      switch (name) {
        case 'searchProducts':
          return await this.searchProducts(args as SearchProductsArgs);
        case 'getProductDetails':
          return await this.getProductDetails(args as GetProductDetailsArgs);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      this.logger.error(`Tool ${name} failed`, error);
      return {
        error: `Failed to execute ${name}. Please try a different query.`,
      };
    }
  }

  private async searchProducts(params: SearchProductsArgs) {
    const filters: Prisma.ProductWhereInput[] = [];

    if (params.query?.trim()) {
      const query = params.query.trim();
      filters.push({
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      });
    }

    if (params.category?.trim()) {
      const category = params.category.trim();
      filters.push({
        productCategories: {
          some: {
            category: {
              OR: [
                {
                  categoryName: { equals: category, mode: 'insensitive' },
                },
                { slug: { equals: category, mode: 'insensitive' } },
              ],
            },
          },
        },
      });
    }

    if (params.color?.trim()) {
      const color = params.color.trim();
      filters.push({
        variantValues: {
          some: {
            variantValue: {
              value: { equals: color, mode: 'insensitive' },
              variantType: {
                OR: [
                  { name: { equals: 'color', mode: 'insensitive' } },
                  { slug: { equals: 'color', mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      });
    }

    if (params.maxPrice != null && !Number.isNaN(Number(params.maxPrice))) {
      const maxPrice = Number(params.maxPrice);
      filters.push({
        OR: [
          { basePrice: { lte: maxPrice } },
          {
            variants: {
              some: { isActive: true, price: { lte: maxPrice } },
            },
          },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = {
      productStatus: true,
      ...(filters.length ? { AND: filters } : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      take: SEARCH_LIMIT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        basePrice: true,
        variants: {
          where: { isActive: true },
          take: 8,
          select: {
            sku: true,
            price: true,
            stock: true,
            combinationValues: {
              select: {
                variantValue: { select: variantValueSelect },
              },
            },
          },
        },
      },
    });

    return {
      count: products.length,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        basePrice: product.basePrice,
        variants: product.variants.map((variant) => ({
          sku: variant.sku,
          price: variant.price,
          stock: variant.stock,
          attributes: variant.combinationValues.map(
            ({ variantValue }) =>
              `${variantValue.variantType.name}: ${variantValue.value}`,
          ),
        })),
      })),
    };
  }

  private async getProductDetails(params: GetProductDetailsArgs) {
    const productName = params.productName?.trim();
    if (!productName) {
      return { message: 'productName is required' };
    }

    const product = await this.prisma.product.findFirst({
      where: {
        productStatus: true,
        name: { contains: productName, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        basePrice: true,
        hasVariants: true,
        variants: {
          where: { isActive: true },
          orderBy: { id: 'asc' },
          select: {
            sku: true,
            price: true,
            stock: true,
            combinationValues: {
              select: {
                variantValue: { select: variantValueSelect },
              },
            },
          },
        },
      },
    });

    if (!product) {
      return { message: `Product not found for "${productName}"` };
    }

    const colors = new Set<string>();
    const sizes = new Set<string>();

    for (const variant of product.variants) {
      for (const { variantValue } of variant.combinationValues) {
        const typeName = variantValue.variantType.name.toLowerCase();
        const typeSlug = variantValue.variantType.slug.toLowerCase();

        if (typeName === 'color' || typeSlug === 'color') {
          colors.add(variantValue.value);
        }
        if (typeName === 'size' || typeSlug === 'size') {
          sizes.add(variantValue.value);
        }
      }
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      basePrice: product.basePrice,
      hasVariants: product.hasVariants,
      availableColors: [...colors],
      availableSizes: [...sizes],
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,
        inStock: variant.stock > 0,
        attributes: variant.combinationValues.map(
          ({ variantValue }) =>
            `${variantValue.variantType.name}: ${variantValue.value}`,
        ),
      })),
    };
  }
}
