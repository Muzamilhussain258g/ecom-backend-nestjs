import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAllProductsDto } from './get-all-products.dto';

describe('GetAllProductsDto', () => {
  it('trims search and transforms pagination values', async () => {
    const dto = plainToInstance(GetAllProductsDto, {
      search: '  infinix note  ',
      page: '2',
      limit: '5',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({ search: 'infinix note', page: 2, limit: 5 });
  });

  it('rejects a blank search value', async () => {
    const dto = plainToInstance(GetAllProductsDto, { search: '   ' });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
