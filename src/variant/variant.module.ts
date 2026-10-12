import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { RolesGuard } from '@/common/guards/roles.guard';
import { VariantTypeController } from './variant-type.controller';
import { VariantValueController } from './variant-value.controller';
import { VariantService } from './variant.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VariantTypeController, VariantValueController],
  providers: [VariantService, RolesGuard],
})
export class VariantModule {}
