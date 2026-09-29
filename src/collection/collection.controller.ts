import { Body, Controller, Get, Post, UseGuards, Param } from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Role } from '@/common/decorators/role.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { CollectionService } from './collection.service';
import { CreateCollectionDto } from './dto/create-collection.dto';

@Controller('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @ResponseMessage('Collections fetched successfully')
  findAll() {
    return this.collectionService.findAll();
  }

  @Get(':slug')
  @ResponseMessage('Collection fetched successfully')
  findOne(@Param('slug') slug: string) {
    return this.collectionService.findOne(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Role(UserRole.admin, UserRole.seller)
  @ResponseMessage('Collection created successfully')
  create(@Body() dto: CreateCollectionDto) {
    return this.collectionService.create(dto);
  }
}
