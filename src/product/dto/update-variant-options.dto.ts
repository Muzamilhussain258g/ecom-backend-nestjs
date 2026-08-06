import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ProductVariantSelectionDto } from './create-product.dto';

export class UpdateVariantOptionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantSelectionDto)
  variantSelections!: ProductVariantSelectionDto[];
}
