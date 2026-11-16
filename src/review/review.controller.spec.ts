import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';
import { ROLES_KEY } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

describe('ReviewController', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const adminListHandler = ReviewController.prototype.getAllReviewsAdmin;

  it('restricts the admin review list to authenticated admins', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, adminListHandler)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, adminListHandler)).toEqual([
      UserRole.admin,
    ]);
  });

  it('uses HTTP 200 for the admin review list', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, adminListHandler)).toBe(
      HttpStatus.OK,
    );
  });

  it('passes query filters to the review service', async () => {
    const query = { page: 2, limit: 20, search: 'shirt', productId: 7 };
    const result = { reviews: [], pagination: {} };
    const reviewService = {
      getAllReviewsAdmin: jest.fn().mockResolvedValue(result),
    };
    const controller = new ReviewController(
      reviewService as unknown as ReviewService,
    );

    await expect(controller.getAllReviewsAdmin(query)).resolves.toBe(result);
    expect(reviewService.getAllReviewsAdmin).toHaveBeenCalledWith(query);
  });
});
