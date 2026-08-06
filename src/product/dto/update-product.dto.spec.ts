import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductDto } from './update-product.dto';

describe('UpdateProductDto', () => {
  it('accepts a partial payload and trims text', async () => {
    const dto = plainToInstance(UpdateProductDto, {
      name: '  Infinix Note 40 Pro  ',
      basePrice: '69999.99',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Infinix Note 40 Pro');
    expect(dto.basePrice).toBe(69999.99);
  });

  it.each([
    ['blank name', { name: '   ' }],
    ['invalid price', { basePrice: 0 }],
    ['empty categories', { categories: [] }],
    ['invalid status', { productStatus: 'active' }],
  ])('rejects %s', async (_label, payload) => {
    const dto = plainToInstance(UpdateProductDto, payload);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
