import {
  Body,
  Controller,
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
import { UserRole } from 'generated/prisma/enums';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import {
  OrderResponseDto,
  PaginatedOrderResponseDto,
} from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderService } from './order.service';

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // ================= ADMIN / SELLER ROUTES (Registered first to avoid route collisions) =================

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('All orders fetched successfully')
  @ApiOperation({ summary: 'Admin/Seller: List all orders across all users' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All orders fetched successfully',
    type: PaginatedOrderResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  getAllOrdersAdmin(@Query() query: AdminOrderQueryDto) {
    return this.orderService.getAllOrdersAdmin(query);
  }

  @Patch('admin/:id/status')
  @UseGuards(RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Order status updated successfully')
  @ApiOperation({
    summary:
      'Admin/Seller: Update order status (marks COD payment success on delivery, restocks on cancel/return)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order status updated successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid status transition' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateOrderStatus(id, dto);
  }

  // ================= CUSTOMER ROUTES =================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Order placed successfully')
  @ApiOperation({
    summary:
      'Place a new COD order (checks out selected items from cart or direct items, deducts stock, snapshots shipping address)',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order placed successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Insufficient stock, invalid address, or empty cart',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Orders fetched successfully')
  @ApiOperation({ summary: 'List customer orders with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orders fetched successfully',
    type: PaginatedOrderResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  getUserOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrderQueryDto,
  ) {
    return this.orderService.getUserOrders(user.id, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Order fetched successfully')
  @ApiOperation({ summary: 'Get order details by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order fetched successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  getOrderById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.getOrderById(user.id, user.role, id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Order cancelled successfully')
  @ApiOperation({
    summary:
      'Cancel a pending order (restocks product variants and sets status to cancelled)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order cancelled successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Only pending orders can be cancelled',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.cancelOrder(user.id, user.role, id);
  }
}
