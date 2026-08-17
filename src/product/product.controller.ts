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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { GetAllProductsDto } from './dto/get-all-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateVariantOptionsDto } from './dto/update-variant-options.dto';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Product created successfully')
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Get()
  @ResponseMessage('Products fetched successfully')
  findAll(@Query() dto: GetAllProductsDto) {
    return this.productService.findAll(dto);
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product fetched successfully')
  findOne(@Param('slug') slug: string) {
    return this.productService.findOne(slug);
  }

  // Product writes are restricted to authenticated admins and sellers.
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Product updated successfully')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Put(':id/variant-options')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Product variant options updated successfully')
  updateVariantOptions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVariantOptionsDto,
  ) {
    return this.productService.updateVariantOptions(id, dto);
  }

  @Patch(':productId/variants/:variantId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Product variant updated successfully')
  updateVariant(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productService.updateVariant(productId, variantId, dto);
  }
}
