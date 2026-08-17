import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';

type VariantSeed = {
  name: string;
  slug: string;
  values: Array<{
    value: string;
    code: string;
    metadata?: Record<string, string>;
  }>;
};

type CategorySeed = {
  name: string;
  slug: string;
  child: { name: string; slug: string };
};

type ProductSeedGroup = {
  parentSlug: string | null;
  categorySlug: string;
  variantSelections: Record<string, string[]>;
  products: Array<{ name: string; basePrice: number }>;
};

const variants: VariantSeed[] = [
  {
    name: 'Color',
    slug: 'color',
    values: [
      { value: 'Red', code: 'RED', metadata: { hex: '#FF0000' } },
      { value: 'Blue', code: 'BLUE', metadata: { hex: '#0000FF' } },
      { value: 'Black', code: 'BLACK', metadata: { hex: '#000000' } },
      { value: 'White', code: 'WHITE', metadata: { hex: '#FFFFFF' } },
    ],
  },
  {
    name: 'Size',
    slug: 'size',
    values: [
      { value: 'Small', code: 'S' },
      { value: 'Medium', code: 'M' },
      { value: 'Large', code: 'L' },
      { value: 'Extra Large', code: 'XL' },
    ],
  },
  {
    name: 'Material',
    slug: 'material',
    values: [
      { value: 'Cotton', code: 'COTTON' },
      { value: 'Polyester', code: 'POLYESTER' },
      { value: 'Leather', code: 'LEATHER' },
      { value: 'Stainless Steel', code: 'STEEL' },
      { value: 'Ceramic', code: 'CERAMIC' },
      { value: 'Glass', code: 'GLASS' },
    ],
  },
  {
    name: 'Storage',
    slug: 'storage',
    values: [
      { value: '64 GB', code: '64GB' },
      { value: '128 GB', code: '128GB' },
      { value: '256 GB', code: '256GB' },
    ],
  },
  {
    name: 'Volume',
    slug: 'volume',
    values: [
      { value: '50 ml', code: '50ML' },
      { value: '100 ml', code: '100ML' },
      { value: '200 ml', code: '200ML' },
    ],
  },
];

const categories: CategorySeed[] = [
  {
    name: 'Fashion',
    slug: 'fashion',
    child: { name: 'Clothing', slug: 'clothing' },
  },
  {
    name: 'Electronics',
    slug: 'electronics',
    child: { name: 'Mobiles', slug: 'mobiles' },
  },
  {
    name: 'Home & Living',
    slug: 'home-living',
    child: { name: 'Kitchen', slug: 'kitchen' },
  },
  {
    name: 'Beauty & Personal Care',
    slug: 'beauty-personal-care',
    child: { name: 'Skin Care', slug: 'skin-care' },
  },
  {
    name: 'Sports & Outdoors',
    slug: 'sports-outdoors',
    child: { name: 'Fitness Equipment', slug: 'fitness-equipment' },
  },
];

const productGroups: ProductSeedGroup[] = [
  {
    parentSlug: null,
    categorySlug: 'fashion',
    variantSelections: {
      color: ['RED', 'BLUE', 'BLACK', 'WHITE'],
      material: ['COTTON', 'LEATHER'],
    },
    products: [
      { name: 'Everyday Backpack', basePrice: 3999 },
      { name: 'Classic Baseball Cap', basePrice: 1299 },
      { name: 'Aviator Sunglasses', basePrice: 2999 },
      { name: 'Classic Leather Belt', basePrice: 1999 },
      { name: 'Bifold Wallet', basePrice: 2499 },
    ],
  },
  {
    parentSlug: 'fashion',
    categorySlug: 'clothing',
    variantSelections: {
      color: ['RED', 'BLUE', 'BLACK', 'WHITE'],
      size: ['S', 'M', 'L', 'XL'],
    },
    products: [
      { name: 'Classic Cotton T-Shirt', basePrice: 1499 },
      { name: 'Slim Fit Jeans', basePrice: 3499 },
      { name: 'Casual Oxford Shirt', basePrice: 2799 },
      { name: 'Hooded Sweatshirt', basePrice: 3999 },
      { name: 'Chino Trousers', basePrice: 3299 },
    ],
  },
  {
    parentSlug: null,
    categorySlug: 'electronics',
    variantSelections: { color: ['BLUE', 'BLACK', 'WHITE'] },
    products: [
      { name: 'Wave Wireless Earbuds', basePrice: 6999 },
      { name: 'BassBox Bluetooth Speaker', basePrice: 9999 },
      { name: 'Studio Over-Ear Headphones', basePrice: 14999 },
      { name: 'FitTrack Smart Watch', basePrice: 12999 },
      { name: 'FastCharge Power Bank', basePrice: 7999 },
    ],
  },
  {
    parentSlug: 'electronics',
    categorySlug: 'mobiles',
    variantSelections: {
      color: ['BLUE', 'BLACK', 'WHITE'],
      storage: ['64GB', '128GB', '256GB'],
    },
    products: [
      { name: 'Nova X1 Smartphone', basePrice: 59999 },
      { name: 'Orbit A5 Smartphone', basePrice: 44999 },
      { name: 'Pulse Pro Smartphone', basePrice: 84999 },
      { name: 'Vertex Lite Smartphone', basePrice: 34999 },
      { name: 'Zenith Max Smartphone', basePrice: 109999 },
    ],
  },
  {
    parentSlug: null,
    categorySlug: 'home-living',
    variantSelections: { color: ['RED', 'BLUE', 'BLACK', 'WHITE'] },
    products: [
      { name: 'Modern Lounge Chair', basePrice: 24999 },
      { name: 'Ambient Table Lamp', basePrice: 4499 },
      { name: 'Decorative Wall Clock', basePrice: 3999 },
      { name: 'Ceramic Flower Vase', basePrice: 2799 },
      { name: 'Cushion Cover Set', basePrice: 2499 },
    ],
  },
  {
    parentSlug: 'home-living',
    categorySlug: 'kitchen',
    variantSelections: { material: ['STEEL', 'CERAMIC', 'GLASS'] },
    products: [
      { name: 'Non-Stick Cookware Set', basePrice: 12999 },
      { name: 'Kitchen Storage Jar Set', basePrice: 3499 },
      { name: 'Premium Knife Set', basePrice: 6999 },
      { name: 'Serving Bowl Set', basePrice: 4499 },
      { name: 'Heat Resistant Kitchen Mat', basePrice: 2499 },
    ],
  },
  {
    parentSlug: null,
    categorySlug: 'beauty-personal-care',
    variantSelections: { volume: ['50ML', '100ML', '200ML'] },
    products: [
      { name: 'Repairing Daily Shampoo', basePrice: 1499 },
      { name: 'Nourishing Hair Conditioner', basePrice: 1599 },
      { name: 'Argan Hair Oil', basePrice: 2199 },
      { name: 'Ocean Mist Perfume', basePrice: 4999 },
      { name: 'Fresh Daily Deodorant', basePrice: 1299 },
    ],
  },
  {
    parentSlug: 'beauty-personal-care',
    categorySlug: 'skin-care',
    variantSelections: { volume: ['50ML', '100ML', '200ML'] },
    products: [
      { name: 'Hydrating Face Cleanser', basePrice: 1799 },
      { name: 'Daily Moisturizing Cream', basePrice: 2299 },
      { name: 'Vitamin C Face Serum', basePrice: 2999 },
      { name: 'SPF 50 Sunscreen', basePrice: 2499 },
      { name: 'Gentle Exfoliating Toner', basePrice: 1999 },
    ],
  },
  {
    parentSlug: null,
    categorySlug: 'sports-outdoors',
    variantSelections: {
      color: ['RED', 'BLUE', 'BLACK', 'WHITE'],
      size: ['S', 'M', 'L', 'XL'],
    },
    products: [
      { name: 'Performance Sports T-Shirt', basePrice: 1999 },
      { name: 'Training Track Pants', basePrice: 2999 },
      { name: 'Lightweight Running Jacket', basePrice: 4499 },
      { name: 'Breathable Sports Shorts', basePrice: 1899 },
      { name: 'Hiking Daypack', basePrice: 6999 },
    ],
  },
  {
    parentSlug: 'sports-outdoors',
    categorySlug: 'fitness-equipment',
    variantSelections: { color: ['RED', 'BLUE', 'BLACK'] },
    products: [
      { name: 'Adjustable Dumbbell Set', basePrice: 14999 },
      { name: 'Premium Yoga Mat', basePrice: 3499 },
      { name: 'Resistance Band Set', basePrice: 2499 },
      { name: 'Digital Skipping Rope', basePrice: 1999 },
      { name: 'Home Workout Bench', basePrice: 24999 },
    ],
  },
];

const categoryCount = categories.length * 2;
const productCount = productGroups.reduce(
  (total, group) => total + group.products.length,
  0,
);
if (
  categoryCount !== 10 ||
  productCount !== 50 ||
  productGroups.some((group) => group.products.length !== 5)
) {
  throw new Error('Seed catalog must contain 10 categories and 50 products');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run the database seeder');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function createSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) throw new Error(`Cannot create a slug for ${value}`);
  return slug;
}

async function seedVariants() {
  for (const [typeIndex, variant] of variants.entries()) {
    const variantType = await prisma.variantType.upsert({
      where: { slug: variant.slug },
      update: { name: variant.name, sortOrder: typeIndex },
      create: {
        name: variant.name,
        slug: variant.slug,
        sortOrder: typeIndex,
      },
    });

    for (const [valueIndex, item] of variant.values.entries()) {
      await prisma.variantValue.upsert({
        where: {
          variantTypeId_code: {
            variantTypeId: variantType.id,
            code: item.code,
          },
        },
        update: {
          value: item.value,
          metadata: item.metadata,
          sortOrder: valueIndex,
        },
        create: {
          variantTypeId: variantType.id,
          value: item.value,
          code: item.code,
          metadata: item.metadata,
          sortOrder: valueIndex,
        },
      });
    }
  }
}

async function seedCategories() {
  for (const category of categories) {
    const existingRoot = await prisma.category.findFirst({
      where: { parentId: null, slug: category.slug },
    });
    const root = existingRoot
      ? await prisma.category.update({
          where: { id: existingRoot.id },
          data: { categoryName: category.name },
        })
      : await prisma.category.create({
          data: {
            categoryName: category.name,
            slug: category.slug,
            parentId: null,
          },
        });

    const existingChild = await prisma.category.findFirst({
      where: { parentId: root.id, slug: category.child.slug },
    });
    if (existingChild) {
      await prisma.category.update({
        where: { id: existingChild.id },
        data: { categoryName: category.child.name },
      });
    } else {
      await prisma.category.create({
        data: {
          categoryName: category.child.name,
          slug: category.child.slug,
          parentId: root.id,
        },
      });
    }
  }
}

async function seedProducts() {
  const variantTypes = await prisma.variantType.findMany({
    include: { values: true },
  });
  const variantTypeBySlug = new Map(
    variantTypes.map((variantType) => [variantType.slug, variantType]),
  );
  let productCount = 0;
  let productVariantCount = 0;

  for (const group of productGroups) {
    const parentCategory = group.parentSlug
      ? await prisma.category.findFirstOrThrow({
          where: { parentId: null, slug: group.parentSlug },
        })
      : null;
    const category = await prisma.category.findFirstOrThrow({
      where: {
        parentId: parentCategory?.id ?? null,
        slug: group.categorySlug,
      },
    });
    const selections = Object.entries(group.variantSelections)
      .map(([variantTypeSlug, codes]) => {
        const variantType = variantTypeBySlug.get(variantTypeSlug);
        if (!variantType) {
          throw new Error(`Seeded variant type ${variantTypeSlug} not found`);
        }
        const valueByCode = new Map(
          variantType.values.map((value) => [value.code, value]),
        );
        const values = codes.map((code) => {
          const value = valueByCode.get(code);
          if (!value) {
            throw new Error(
              `Seeded value ${code} not found for ${variantTypeSlug}`,
            );
          }
          return value;
        });
        return { variantTypeId: variantType.id, values };
      })
      .sort((first, second) => first.variantTypeId - second.variantTypeId);

    let combinations: Array<{ valueIds: number[]; codes: string[] }> = [
      { valueIds: [], codes: [] },
    ];
    for (const selection of selections) {
      combinations = combinations.flatMap((combination) =>
        selection.values.map((value) => ({
          valueIds: [...combination.valueIds, value.id],
          codes: [...combination.codes, value.code],
        })),
      );
    }

    for (const [productIndex, item] of group.products.entries()) {
      const description = `${item.name} from our ${category.categoryName} collection.`;
      const slug = createSlug(item.name);
      const existingProduct = await prisma.product.findFirst({
        where: { OR: [{ slug }, { name: item.name }] },
      });
      const product = existingProduct
        ? await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              description,
              slug,
              basePrice: item.basePrice,
              hasVariants: true,
              productStatus: true,
            },
          })
        : await prisma.product.create({
            data: {
              name: item.name,
              slug,
              description,
              basePrice: item.basePrice,
              hasVariants: true,
            },
          });

      await prisma.productCategory.deleteMany({
        where: { productId: product.id },
      });
      await prisma.productCategory.create({
        data: {
          productId: product.id,
          categoryId: category.id,
          isPrimary: true,
        },
      });
      await prisma.productVariantType.deleteMany({
        where: { productId: product.id },
      });
      await prisma.productVariantValue.deleteMany({
        where: { productId: product.id },
      });
      await prisma.productVariantType.createMany({
        data: selections.map(({ variantTypeId }) => ({
          productId: product.id,
          variantTypeId,
        })),
      });
      await prisma.productVariantValue.createMany({
        data: selections.flatMap(({ values }) =>
          values.map(({ id: variantValueId }) => ({
            productId: product.id,
            variantValueId,
          })),
        ),
      });

      const desiredCombinationKeys: string[] = [];
      for (const combination of combinations) {
        const combinationKey = [...combination.valueIds]
          .sort((first, second) => first - second)
          .join('-');
        desiredCombinationKeys.push(combinationKey);
        const skuPrefix = `SEED-${group.categorySlug}-${productIndex + 1}`;
        const productVariant = await prisma.variant.upsert({
          where: {
            productId_combinationKey: {
              productId: product.id,
              combinationKey,
            },
          },
          update: {
            sku: `${skuPrefix}-${combination.codes.join('-')}`,
            price: item.basePrice,
            stock: 25,
            isActive: true,
          },
          create: {
            productId: product.id,
            combinationKey,
            sku: `${skuPrefix}-${combination.codes.join('-')}`,
            price: item.basePrice,
            stock: 25,
            isActive: true,
          },
        });
        await prisma.variantCombinationValue.createMany({
          data: combination.valueIds.map((variantValueId) => ({
            variantId: productVariant.id,
            variantValueId,
          })),
          skipDuplicates: true,
        });
      }

      await prisma.variant.updateMany({
        where: {
          productId: product.id,
          combinationKey: { notIn: desiredCombinationKeys },
        },
        data: { isActive: false },
      });
      productCount += 1;
      productVariantCount += combinations.length;
    }
  }

  return { productCount, productVariantCount };
}

async function main() {
  await seedVariants();
  await seedCategories();
  const seededProducts = await seedProducts();

  const variantValueCount = variants.reduce(
    (total, variant) => total + variant.values.length,
    0,
  );
  console.log(
    `Seed completed: ${variants.length} variant types, ${variantValueCount} variant values, ${categoryCount} categories, ${seededProducts.productCount} products, and ${seededProducts.productVariantCount} product variants.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
