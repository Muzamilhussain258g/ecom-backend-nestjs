import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AddressType } from 'generated/prisma/enums';

export class CreateAddressDto {
  @ApiProperty({
    enum: AddressType,
    example: AddressType.home,
    description: 'Address label category (home, office, or other)',
  })
  @IsEnum(AddressType, {
    message: 'Label must be one of: home, office, other',
  })
  label: AddressType;

  @ApiProperty({ example: 'Jane Doe', description: 'Recipient full name' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({
    example: '+1-555-0199',
    description: 'Contact phone number (7-20 chars)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[+0-9\s\-()]{7,20}$/, {
    message: 'Phone number format is invalid',
  })
  phone: string;

  @ApiProperty({
    example: '123 Elm Street, Apt 4B',
    description: 'Street address',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  street: string;

  @ApiProperty({ example: 'Metropolis', description: 'City name' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Central State', description: 'Province or state' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;

  @ApiProperty({ example: '12345', description: 'Postal or ZIP code' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode: string;

  @ApiProperty({ example: 'United States', description: 'Country name' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Whether to set as default shipping address',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
