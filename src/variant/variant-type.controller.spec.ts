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

  it('restricts master-data creation to admins', () => {
    // Metadata belongs to the original handler and must not be bound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const handler = VariantTypeController.prototype.create;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.admin]);
  });
});
