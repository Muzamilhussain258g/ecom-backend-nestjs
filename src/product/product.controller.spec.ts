import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { UserRole } from 'generated/prisma/enums';
import { ROLES_KEY } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

describe('ProductController', () => {
  // Metadata is attached to the original method, so it must not be bound.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const createHandler = ProductController.prototype.create;

  it('uses 201 Created for product creation', () => {
    const status = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      createHandler,
    ) as unknown;

    expect(status).toBe(HttpStatus.CREATED);
  });

  it('allows only admin and seller roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, createHandler) as unknown;

    expect(roles).toEqual([UserRole.admin, UserRole.seller]);
  });

  it('protects product creation with authentication and role guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      createHandler,
    ) as unknown;

    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('delegates creation to the product service', async () => {
    const dto = {
      name: 'iPhone 16',
      description: 'Latest Apple smartphone',
      basePrice: 250000,
      categories: [{ categoryId: 3, isPrimary: true }],
    };
    const createdProduct = { id: 1, ...dto };
    const productService = {
      create: jest.fn().mockResolvedValue(createdProduct),
    };
    const controller = new ProductController(
      productService as unknown as ProductService,
    );

    await expect(controller.create(dto)).resolves.toBe(createdProduct);
    expect(productService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates the product query to the product service', async () => {
    const dto = { page: 2, limit: 5 };
    const response = {
      products: [],
      meta: {
        pagination: {
          page: 2,
          limit: 5,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    };
    const productService = {
      findAll: jest.fn().mockResolvedValue(response),
    };
    const controller = new ProductController(
      productService as unknown as ProductService,
    );

    await expect(controller.findAll(dto)).resolves.toBe(response);
    expect(productService.findAll).toHaveBeenCalledWith(dto);
  });

  it('delegates a single-product query to the product service', async () => {
    const product = { id: 7, name: 'Infinix Note 40 Pro', colors: [] };
    const productService = {
      findOne: jest.fn().mockResolvedValue(product),
    };
    const controller = new ProductController(
      productService as unknown as ProductService,
    );

    await expect(controller.findOne(7)).resolves.toBe(product);
    expect(productService.findOne).toHaveBeenCalledWith(7);
  });

  it('delegates product updates to the product service', async () => {
    const dto = { basePrice: 69999, productStatus: true };
    const updatedProduct = { id: 7, ...dto };
    const productService = {
      update: jest.fn().mockResolvedValue(updatedProduct),
    };
    const controller = new ProductController(
      productService as unknown as ProductService,
    );

    await expect(controller.update(7, dto)).resolves.toBe(updatedProduct);
    expect(productService.update).toHaveBeenCalledWith(7, dto);
  });

  it('delegates variant option synchronization to the product service', async () => {
    const dto = {
      variantSelections: [{ variantTypeId: 1, variantValueIds: [10, 11] }],
    };
    const productService = {
      updateVariantOptions: jest.fn().mockResolvedValue({ id: 7 }),
    };
    const controller = new ProductController(
      productService as unknown as ProductService,
    );

    await controller.updateVariantOptions(7, dto);
    expect(productService.updateVariantOptions).toHaveBeenCalledWith(7, dto);
  });

  it('delegates a variant inventory update to the product service', async () => {
    const dto = { stock: 25, price: 1599 };
    const productService = {
      updateVariant: jest.fn().mockResolvedValue({ id: 20, ...dto }),
    };
    const controller = new ProductController(
      productService as unknown as ProductService,
    );

    await controller.updateVariant(7, 20, dto);
    expect(productService.updateVariant).toHaveBeenCalledWith(7, 20, dto);
  });
});
