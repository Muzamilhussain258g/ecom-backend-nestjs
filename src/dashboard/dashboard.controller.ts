import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/prisma/enums';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import {
  DateRangeQueryDto,
  InventoryAlertsQueryDto,
  RecentOrdersQueryDto,
  SalesQueryDto,
  TopProductsQueryDto,
} from './dto/dashboard-query.dto';
import {
  DashboardOverviewResponseDto,
  InventoryAlertsResponseDto,
  OrderStatusCountDto,
  RecentOrdersResponseDto,
  SalesResponseDto,
  TopProductDto,
} from './dto/dashboard-response.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Admin Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Role(UserRole.admin)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ResponseMessage('Dashboard overview fetched successfully')
  @ApiOperation({ summary: 'Admin: Get dashboard KPI summary' })
  @ApiOkResponse({ type: DashboardOverviewResponseDto })
  getOverview(@Query() query: DateRangeQueryDto) {
    return this.dashboardService.getOverview(query);
  }

  @Get('sales')
  @ResponseMessage('Dashboard sales fetched successfully')
  @ApiOperation({ summary: 'Admin: Get revenue and order trend' })
  @ApiOkResponse({ type: SalesResponseDto })
  getSales(@Query() query: SalesQueryDto) {
    return this.dashboardService.getSales(query);
  }

  @Get('orders-breakdown')
  @ResponseMessage('Order status breakdown fetched successfully')
  @ApiOperation({ summary: 'Admin: Get order counts by status' })
  @ApiOkResponse({ type: [OrderStatusCountDto] })
  getOrdersBreakdown(@Query() query: DateRangeQueryDto) {
    return this.dashboardService.getOrdersBreakdown(query);
  }

  @Get('top-products')
  @ResponseMessage('Top products fetched successfully')
  @ApiOperation({ summary: 'Admin: Get top-selling products' })
  @ApiOkResponse({ type: [TopProductDto] })
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.dashboardService.getTopProducts(query);
  }

  @Get('recent-orders')
  @ResponseMessage('Recent orders fetched successfully')
  @ApiOperation({ summary: 'Admin: Get compact recent order list' })
  @ApiOkResponse({ type: RecentOrdersResponseDto })
  getRecentOrders(@Query() query: RecentOrdersQueryDto) {
    return this.dashboardService.getRecentOrders(query);
  }

  @Get('inventory-alerts')
  @ResponseMessage('Inventory alerts fetched successfully')
  @ApiOperation({ summary: 'Admin: Get paginated low-stock variants' })
  @ApiOkResponse({ type: InventoryAlertsResponseDto })
  getInventoryAlerts(@Query() query: InventoryAlertsQueryDto) {
    return this.dashboardService.getInventoryAlerts(query);
  }
}
