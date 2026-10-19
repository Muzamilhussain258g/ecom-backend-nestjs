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
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('Cart')
@ApiBearerAuth('JWT-auth')
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cart fetched successfully')
  @ApiOperation({ summary: 'Get current user cart' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart fetched successfully',
    type: CartResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Item added to cart successfully')
  @ApiOperation({ summary: 'Add product variant to cart' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Item added to cart successfully',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Insufficient stock or invalid input',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product variant not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cart item updated successfully')
  @ApiOperation({ summary: 'Update cart item quantity or selection' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart item updated successfully',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Insufficient stock or invalid input',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Cart item not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cart item removed successfully')
  @ApiOperation({ summary: 'Remove an item from cart' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart item removed successfully',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Cart item not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cart cleared successfully')
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart cleared successfully',
    type: CartResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  clearCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.clearCart(user.id);
  }
}
