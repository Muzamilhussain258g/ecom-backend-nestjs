import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { WishlistPaginationDto } from './dto/wishlist-pagination.dto';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post(':productId')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Product added to wishlist successfully')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.wishlistService.add(user.id, productId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Wishlist fetched successfully')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: WishlistPaginationDto,
  ) {
    return this.wishlistService.findAll(user.id, pagination);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product removed from wishlist successfully')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.wishlistService.remove(user.id, productId);
  }
}
