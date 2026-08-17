import { UserRole } from 'generated/prisma/enums';
import { ROLES_KEY } from '@/common/decorators/role.decorator';
import { VariantTypeController } from './variant-type.controller';
import { VariantService } from './variant.service';

describe('VariantTypeController', () => {
  it('allows public variant master-data lookup', async () => {
    const types = [{ id: 1, name: 'Color', values: [] }];
    const variantService = {
      findAllTypes: jest.fn().mockResolvedValue(types),
    };
    const controller = new VariantTypeController(
      variantService as unknown as VariantService,
    );

    await expect(controller.findAll()).resolves.toBe(types);
    expect(variantService.findAllTypes).toHaveBeenCalledWith();
  });

  it('lists values for a requested variant type', async () => {
    const values = [{ id: 20, value: 'Blue', variantTypeId: 1 }];
    const variantService = {
      findValuesByType: jest.fn().mockResolvedValue(values),
    };
    const controller = new VariantTypeController(
      variantService as unknown as VariantService,
    );

    await expect(controller.findValues(1)).resolves.toBe(values);
    expect(variantService.findValuesByType).toHaveBeenCalledWith(1);
  });

  it('deletes all values for a requested variant type', async () => {
    const variantService = {
      removeValuesByType: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const controller = new VariantTypeController(
      variantService as unknown as VariantService,
    );

    await expect(controller.removeValues(1)).resolves.toEqual({ count: 2 });
    expect(variantService.removeValuesByType).toHaveBeenCalledWith(1);
  });

  it('restricts master-data creation to sellers', () => {
    // Metadata belongs to the original handler and must not be bound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const handler = VariantTypeController.prototype.create;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.seller]);
  });
});
