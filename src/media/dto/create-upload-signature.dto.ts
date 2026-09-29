import { IsEnum } from 'class-validator';

export enum MediaPurpose {
  product = 'product',
  category = 'category',
  collection = 'collection',
}

export class CreateUploadSignatureDto {
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;
}
