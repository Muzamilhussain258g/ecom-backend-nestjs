import { VariantService } from './variant.service';
import { VariantValueController } from './variant-value.controller';

describe('VariantValueController', () => {
  it('allows public variant value lookup', async () => {
    const values = [{ id: 1, value: 'Blue', variantTypeId: 1 }];
    const variantService = {
      findAllValues: jest.fn().mockResolvedValue(values),
    };
    const controller = new VariantValueController(
      variantService as unknown as VariantService,
    );

    await expect(controller.findAll()).resolves.toBe(values);
    expect(variantService.findAllValues).toHaveBeenCalledWith();
  });
});
