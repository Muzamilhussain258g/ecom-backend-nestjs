import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { UserRole } from 'generated/prisma/enums';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

describe('WishlistController', () => {
  // Metadata is attached to the original methods, so they must not be bound.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const addHandler = WishlistController.prototype.add;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const findAllHandler = WishlistController.prototype.findAll;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const removeHandler = WishlistController.prototype.remove;

  const user: AuthenticatedUser = {
    id: 4,
    name: 'Customer',
    email: 'customer@example.com',
    role: UserRole.customer,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('protects every wishlist route with JWT authentication', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, WishlistController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('uses the expected success status codes', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, addHandler)).toBe(
      HttpStatus.CREATED,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, findAllHandler)).toBe(
      HttpStatus.OK,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, removeHandler)).toBe(
      HttpStatus.OK,
    );
  });

  it('delegates add, list, and remove with the authenticated user id', async () => {
    const service = {
      add: jest.fn().mockResolvedValue({ id: 1 }),
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      remove: jest.fn().mockResolvedValue({ productId: 12 }),
    };
    const controller = new WishlistController(
      service as unknown as WishlistService,
    );
    const pagination = { page: 1, limit: 20 };

    await controller.add(user, 12);
    await controller.findAll(user, pagination);
    await controller.remove(user, 12);

    expect(service.add).toHaveBeenCalledWith(4, 12);
    expect(service.findAll).toHaveBeenCalledWith(4, pagination);
    expect(service.remove).toHaveBeenCalledWith(4, 12);
  });
});
