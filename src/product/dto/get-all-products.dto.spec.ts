import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GetAllProductsDto,
  ProductSortOrder,
} from './get-all-products.dto';

describe('GetAllProductsDto', () => {
  it('trims search and transforms pagination values', async () => {
    const dto = plainToInstance(GetAllProductsDto, {
      search: '  infinix note  ',
      category: '  Clothing  ',
      sortOrder: 'asc',
      minPrice: '500.25',
      maxPrice: '1200',
      inStock: 'false',
      page: '2',
      limit: '5',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      search: 'infinix note',
      category: 'clothing',
      sortOrder: ProductSortOrder.ASC,
      minPrice: 500.25,
      maxPrice: 1200,
      inStock: false,
      page: 2,
      limit: 5,
    });
  });

  it('rejects a blank search value', async () => {
    const dto = plainToInstance(GetAllProductsDto, { search: '   ' });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects a blank category slug', async () => {
    const dto = plainToInstance(GetAllProductsDto, { category: '   ' });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an unsupported sort order', async () => {
    const dto = plainToInstance(GetAllProductsDto, { sortOrder: 'newest' });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects a maximum price below the minimum price', async () => {
    const dto = plainToInstance(GetAllProductsDto, {
      minPrice: '100',
      maxPrice: '99.99',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an unsupported sort field', async () => {
    const dto = plainToInstance(GetAllProductsDto, { sortBy: 'rating' });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
