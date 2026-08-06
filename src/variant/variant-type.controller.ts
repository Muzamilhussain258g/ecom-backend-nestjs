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
import { UserRole } from 'generated/prisma/enums';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CreateVariantTypeDto } from './dto/create-variant-type.dto';
import { CreateVariantValueDto } from './dto/create-variant-value.dto';
import { UpdateVariantTypeDto } from './dto/update-variant-type.dto';
import { VariantService } from './variant.service';

@Controller('variant-types')
export class VariantTypeController {
  constructor(private readonly variantService: VariantService) {}

  @Get()
  @ResponseMessage('Variant types fetched successfully')
  findAll() {
    return this.variantService.findAllTypes();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.seller)
  @ResponseMessage('Variant type created successfully')
  create(@Body() dto: CreateVariantTypeDto) {
    return this.variantService.createType(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.seller)
  @ResponseMessage('Variant type updated successfully')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVariantTypeDto,
  ) {
    return this.variantService.updateType(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin)
  @ResponseMessage('Variant type deleted successfully')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.variantService.removeType(id);
  }

  @Post(':id/values')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin)
  @ResponseMessage('Variant value created successfully')
  createValue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateVariantValueDto,
  ) {
    return this.variantService.createValue(id, dto);
  }
}
