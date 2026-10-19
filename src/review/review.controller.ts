import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import {
  ProductReviewsResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Review submitted successfully')
  @ApiOperation({ summary: 'Submit a product review' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Review submitted successfully',
    type: ReviewResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User has already reviewed this product',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(user.id, productId, dto);
  }

  @Get('products/:productId/reviews')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product reviews fetched successfully')
  @ApiOperation({ summary: 'Get all reviews for a product with summary' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reviews fetched successfully',
    type: ProductReviewsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  getProductReviews(
    @Param('productId', ParseIntPipe) productId: number,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.getProductReviews(productId, query);
  }

  @Patch('reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review updated successfully')
  @ApiOperation({ summary: 'Update an existing review' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Review updated successfully',
    type: ReviewResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Can only update own review',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Review not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  updateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reviewId', ParseIntPipe) reviewId: number,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(user.id, reviewId, dto);
  }

  @Delete('reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review deleted successfully')
  @ApiOperation({ summary: 'Delete a review' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Review deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Can only delete own review',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Review not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  deleteReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reviewId', ParseIntPipe) reviewId: number,
  ) {
    return this.reviewService.deleteReview(user.id, reviewId, user.role);
  }
}
