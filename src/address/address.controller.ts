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
import { AddressService } from './address.service';
import { AddressResponseDto } from './dto/address-response.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('Addresses')
@ApiBearerAuth('JWT-auth')
@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Address created successfully')
  @ApiOperation({ summary: 'Create a new shipping address' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Address created successfully',
    type: AddressResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressService.create(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Addresses fetched successfully')
  @ApiOperation({ summary: 'List all user shipping addresses' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Addresses fetched successfully',
    type: [AddressResponseDto],
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.addressService.findAll(user.id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Address fetched successfully')
  @ApiOperation({ summary: 'Get a shipping address by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Address fetched successfully',
    type: AddressResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Address not found' })
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.addressService.findById(user.id, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Address updated successfully')
  @ApiOperation({ summary: 'Update a shipping address' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Address updated successfully',
    type: AddressResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or invalid default transition',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Address not found' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Address deleted successfully')
  @ApiOperation({ summary: 'Delete a shipping address' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Address deleted successfully',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Address not found' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.addressService.remove(user.id, id);
  }
}
