import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Role } from '@/common/decorators/role.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UpdateVariantValueDto } from './dto/update-variant-value.dto';
import { VariantService } from './variant.service';

@Controller('variant-values')
@UseGuards(JwtAuthGuard, RolesGuard)
@Role(UserRole.seller)
export class VariantValueController {
  constructor(private readonly variantService: VariantService) {}

  @Patch(':id')
  @ResponseMessage('Variant value updated successfully')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVariantValueDto,
  ) {
    return this.variantService.updateValue(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Variant value deleted successfully')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.variantService.removeValue(id);
  }
}
