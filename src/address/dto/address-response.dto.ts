import { ApiProperty } from '@nestjs/swagger';
import { AddressType } from 'generated/prisma/enums';

export class AddressResponseDto {
  @ApiProperty({ example: 1, description: 'Unique identifier of the address' })
  id: number;

  @ApiProperty({ example: 42, description: 'User ID of the address owner' })
  userId: number;

  @ApiProperty({
    enum: AddressType,
    example: AddressType.home,
    description: 'Address label category (home, office, or other)',
  })
  label: AddressType;

  @ApiProperty({ example: 'Jane Doe', description: 'Recipient full name' })
  fullName: string;

  @ApiProperty({ example: '+1-555-0199', description: 'Recipient contact phone' })
  phone: string;

  @ApiProperty({ example: '123 Elm Street, Apt 4B', description: 'Street address' })
  street: string;

  @ApiProperty({ example: 'Metropolis', description: 'City name' })
  city: string;

  @ApiProperty({ example: 'Central State', description: 'Province or State' })
  province: string;

  @ApiProperty({ example: '12345', description: 'Postal or ZIP code' })
  postalCode: string;

  @ApiProperty({ example: 'United States', description: 'Country name' })
  country: string;

  @ApiProperty({ example: true, description: 'Whether this is the default shipping address' })
  isDefault: boolean;

  @ApiProperty({
    example: '2026-10-16T12:00:00.000Z',
    description: 'Timestamp when the address was created',
  })
  createdAt: Date;
}
