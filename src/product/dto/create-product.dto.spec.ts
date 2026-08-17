import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

describe('CreateProductDto', () => {
  const validPayload = {
    name: 'iPhone 16',
    description: 'Latest Apple smartphone',
    basePrice: 250000,
    categories: [{ categoryId: 3, isPrimary: true }],
  };

  it('accepts and trims a valid payload', async () => {
    const dto = plainToInstance(CreateProductDto, {
      ...validPayload,
      name: '  iPhone 16  ',
      description: '  Latest Apple smartphone  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('iPhone 16');
    expect(dto.description).toBe('Latest Apple smartphone');
  });

  it.each([
    ['empty name', { name: '   ' }],
    ['empty description', { description: '   ' }],
    ['zero price', { basePrice: 0 }],
    ['negative price', { basePrice: -1 }],
    ['empty categories', { categories: [] }],
  ])('rejects %s', async (_label, override) => {
    const dto = plainToInstance(CreateProductDto, {
      ...validPayload,
      ...override,
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts non-negative quantities for exact variant combinations', async () => {
    const dto = plainToInstance(CreateProductDto, {
      ...validPayload,
      hasVariants: true,
      variantSelections: [
        { variantTypeId: 1, variantValueIds: [10, 11] },
        { variantTypeId: 2, variantValueIds: [20] },
      ],
      variantQuantities: [
        { variantValueIds: [10, 20], quantity: 5 },
        { variantValueIds: [11, 20], quantity: 0 },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a negative variant quantity', async () => {
    const dto = plainToInstance(CreateProductDto, {
      ...validPayload,
      hasVariants: true,
      variantSelections: [{ variantTypeId: 1, variantValueIds: [10] }],
      variantQuantities: [{ variantValueIds: [10], quantity: -1 }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
