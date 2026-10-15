import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

type VariantValueSeed = { value: string; code: string };
type VariantTypeSeed = {
  name: string;
  slug: string;
  sortOrder: number;
  values: VariantValueSeed[];
};

type VariantTypeWithValues = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  values: { id: number; value: string; code: string }[];
};

const VARIANT_TYPES: VariantTypeSeed[] = [
  {
    name: 'Color',
    slug: 'color',
    sortOrder: 1,
    values: [
      { value: 'Red', code: 'RED' },
      { value: 'Blue', code: 'BLUE' },
      { value: 'Black', code: 'BLACK' },
    ],
  },
  {
    name: 'Size',
    slug: 'size',
    sortOrder: 2,
    values: [
      { value: 'Small', code: 'S' },
      { value: 'Medium', code: 'M' },
      { value: 'Large', code: 'L' },
    ],
  },
  {
    name: 'Material',
    slug: 'material',
    sortOrder: 3,
    values: [
      { value: 'Cotton', code: 'COTTON' },
      { value: 'Polyester', code: 'POLY' },
    ],
  },
  {
    name: 'Style',
    slug: 'style',
    sortOrder: 4,
    values: [
      { value: 'Casual', code: 'CASUAL' },
      { value: 'Formal', code: 'FORMAL' },
    ],
  },
  {
    name: 'Fit',
    slug: 'fit',
    sortOrder: 5,
    values: [
      { value: 'Regular', code: 'REGULAR' },
      { value: 'Slim', code: 'SLIM' },
      { value: 'Relaxed', code: 'RELAXED' },
    ],
  },
];

const ROOT_CATEGORIES = [
  {
    name: 'Men',
    slug: 'men',
    children: [
      { name: 'Men Clothing', slug: 'men-clothing', leaf: { name: 'Men T-Shirts', slug: 'men-t-shirts' } },
      { name: 'Men Footwear', slug: 'men-footwear', leaf: { name: 'Men Sneakers', slug: 'men-sneakers' } },
    ],
  },
  {
    name: 'Women',
    slug: 'women',
    children: [
      { name: 'Women Clothing', slug: 'women-clothing', leaf: { name: 'Women Dresses', slug: 'women-dresses' } },
      { name: 'Women Accessories', slug: 'women-accessories', leaf: { name: 'Women Bags', slug: 'women-bags' } },
    ],
  },
  {
    name: 'Kids',
    slug: 'kids',
    children: [
      { name: 'Kids Boys', slug: 'kids-boys', leaf: { name: 'Boys Tops', slug: 'boys-tops' } },
      { name: 'Kids Girls', slug: 'kids-girls', leaf: { name: 'Girls Tops', slug: 'girls-tops' } },
    ],
  },
  {
    name: 'Electronics',
    slug: 'electronics',
    children: [
      { name: 'Phones', slug: 'phones', leaf: { name: 'Smartphones', slug: 'smartphones' } },
      { name: 'Audio', slug: 'audio', leaf: { name: 'Headphones', slug: 'headphones' } },
    ],
  },
  {
    name: 'Home',
    slug: 'home',
    children: [
      { name: 'Living Room', slug: 'living-room', leaf: { name: 'Sofas', slug: 'sofas' } },
      { name: 'Bedroom', slug: 'bedroom', leaf: { name: 'Beds', slug: 'beds' } },
    ],
  },
];

/** Clear catalog tables so the seed is re-runnable. */
async function clearCatalog() {
  await prisma.variantCombinationValue.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.productVariantValue.deleteMany();
  await prisma.productVariantType.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.productMedia.deleteMany();
  await prisma.wishList.deleteMany();
  await prisma.collectionProduct.deleteMany();
  await prisma.review.deleteMany();
  await prisma.product.deleteMany();
  await prisma.categoryMedia.deleteMany();

  // Delete deepest categories first (parent FK is Restrict)
  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true },
  });
  const childrenOf = new Map<number | null, number[]>();
  for (const category of categories) {
    const key = category.parentId;
    const list = childrenOf.get(key) ?? [];
    list.push(category.id);
    childrenOf.set(key, list);
  }

  const deleteSubtree = async (parentId: number | null) => {
    const kids = childrenOf.get(parentId) ?? [];
    for (const kid of kids) {
      await deleteSubtree(kid);
      await prisma.category.delete({ where: { id: kid } });
    }
  };
  await deleteSubtree(null);

  await prisma.variantValue.deleteMany();
  await prisma.variantType.deleteMany();
}

async function seedVariantTypes(): Promise<VariantTypeWithValues[]> {
  const created: VariantTypeWithValues[] = [];

  for (const vt of VARIANT_TYPES) {
    const variantType = await prisma.variantType.create({
      data: {
        name: vt.name,
        slug: vt.slug,
        sortOrder: vt.sortOrder,
        values: {
          create: vt.values.map((value, index) => ({
            value: value.value,
            code: value.code,
            sortOrder: index + 1,
          })),
        },
      },
      include: { values: true },
    });

    created.push({
      id: variantType.id,
      name: variantType.name,
      slug: variantType.slug,
      sortOrder: variantType.sortOrder,
      values: variantType.values.map((v) => ({
        id: v.id,
        value: v.value,
        code: v.code,
      })),
    });
  }

  console.log(
    `✅ ${created.length} variant types (${created.map((t) => `${t.name}:${t.values.length}`).join(', ')})`,
  );
  return created;
}

async function createProductWithVariants(params: {
  name: string;
  slug: string;
  categoryId: number;
  productIndex: number;
  variantTypes: VariantTypeWithValues[];
}) {
  const { name, slug, categoryId, productIndex, variantTypes } = params;

  // Cycle 2–4 variant types per product; rotate so products diversify
  const numTypes = 2 + (productIndex % 3); // 2, 3, or 4
  const typesForProduct = [
    ...variantTypes.slice(productIndex % variantTypes.length),
    ...variantTypes.slice(0, productIndex % variantTypes.length),
  ].slice(0, Math.min(numTypes, variantTypes.length));

  const product = await prisma.product.create({
    data: {
      name,
      slug,
      description: `Seeded product "${name}" with multiple variant options.`,
      basePrice: 1000 + productIndex * 150,
      productStatus: true,
      hasVariants: true,
      productCategories: {
        create: {
          categoryId,
          isPrimary: true,
        },
      },
    },
  });

  const assigned: { typeId: number; values: VariantTypeWithValues['values'] }[] = [];

  for (const [typeOffset, vType] of typesForProduct.entries()) {
    const productVariantType = await prisma.productVariantType.create({
      data: {
        productId: product.id,
        variantTypeId: vType.id,
      },
    });

    // Assign 2 or 3 values from this type (cap at available values)
    const want = vType.values.length >= 3 && (productIndex + typeOffset) % 2 === 0 ? 3 : 2;
    const values = vType.values.slice(0, Math.min(want, vType.values.length));
    assigned.push({ typeId: vType.id, values });

    for (const val of values) {
      await prisma.productVariantValue.create({
        data: {
          productVariantTypeId: productVariantType.id,
          variantValueId: val.id,
        },
      });
    }
  }

  // Build sellable SKUs from the first two assigned types (cartesian, capped)
  if (assigned.length >= 2) {
    const [a, b] = assigned;
    let variantCount = 0;
    const maxVariants = 4;

    outer: for (const val1 of a.values) {
      for (const val2 of b.values) {
        if (variantCount >= maxVariants) break outer;
        variantCount += 1;

        const combinationKey = `${val1.id}_${val2.id}`;
        const sku = `${slug.toUpperCase().slice(0, 24)}-${val1.code}-${val2.code}-${product.id}`;

        await prisma.variant.create({
          data: {
            productId: product.id,
            combinationKey,
            sku,
            price: Number(product.basePrice) + variantCount * 100,
            stock: 10 * variantCount,
            isActive: true,
            combinationValues: {
              create: [
                { variantValueId: val1.id },
                { variantValueId: val2.id },
              ],
            },
          },
        });
      }
    }
  }

  return product;
}

async function seedCategoryTree(variantTypes: VariantTypeWithValues[]) {
  let productIndex = 0;
  let categoryCount = 0;
  let productCount = 0;

  for (const root of ROOT_CATEGORIES) {
    const rootCategory = await prisma.category.create({
      data: {
        categoryName: root.name,
        slug: root.slug,
        parentId: null,
      },
    });
    categoryCount += 1;

    for (let i = 1; i <= 2; i++) {
      productIndex += 1;
      await createProductWithVariants({
        name: `${root.name} Product ${i}`,
        slug: `${root.slug}-product-${i}`,
        categoryId: rootCategory.id,
        productIndex,
        variantTypes,
      });
      productCount += 1;
    }

    for (const child of root.children) {
      const childCategory = await prisma.category.create({
        data: {
          categoryName: child.name,
          slug: child.slug,
          parentId: rootCategory.id,
        },
      });
      categoryCount += 1;

      for (let i = 1; i <= 2; i++) {
        productIndex += 1;
        await createProductWithVariants({
          name: `${child.name} Product ${i}`,
          slug: `${child.slug}-product-${i}`,
          categoryId: childCategory.id,
          productIndex,
          variantTypes,
        });
        productCount += 1;
      }

      const leafCategory = await prisma.category.create({
        data: {
          categoryName: child.leaf.name,
          slug: child.leaf.slug,
          parentId: childCategory.id,
        },
      });
      categoryCount += 1;

      for (let i = 1; i <= 2; i++) {
        productIndex += 1;
        await createProductWithVariants({
          name: `${child.leaf.name} Product ${i}`,
          slug: `${child.leaf.slug}-product-${i}`,
          categoryId: leafCategory.id,
          productIndex,
          variantTypes,
        });
        productCount += 1;
      }
    }
  }

  console.log(`✅ ${categoryCount} categories (5 roots × 2 nested × 1 leaf each)`);
  console.log(`✅ ${productCount} products (2 per category, multi variant types/values)`);
}

async function main() {
  console.log('🌱 Starting catalog seed...');

  await clearCatalog();
  console.log('🧹 Cleared previous catalog / variant seed data');

  const variantTypes = await seedVariantTypes();
  await seedCategoryTree(variantTypes);

  const [variantTypeCount, variantValueCount, categoryCount, productCount, skuCount] =
    await Promise.all([
      prisma.variantType.count(),
      prisma.variantValue.count(),
      prisma.category.count(),
      prisma.product.count(),
      prisma.variant.count(),
    ]);

  console.log('🎉 Seeding completed successfully!');
  console.log(
    JSON.stringify(
      {
        variantTypes: variantTypeCount,
        variantValues: variantValueCount,
        categories: categoryCount,
        products: productCount,
        skus: skuCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
