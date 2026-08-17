import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GetAllProductsDto,
  ProductNameSortOrder,
} from './get-all-products.dto';

describe('GetAllProductsDto', () => {
  it('trims search and transforms pagination values', async () => {
    const dto = plainToInstance(GetAllProductsDto, {
      search: '  infinix note  ',
      category: '  Clothing  ',
      sortOrder: 'asc',
      page: '2',
      limit: '5',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      search: 'infinix note',
      category: 'clothing',
      sortOrder: ProductNameSortOrder.ASC,
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
});
