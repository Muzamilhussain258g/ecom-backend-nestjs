import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'prisma/prisma.module';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { VariantTypeController } from './variant-type.controller';
import { VariantValueController } from './variant-value.controller';
import { VariantService } from './variant.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [VariantTypeController, VariantValueController],
  providers: [VariantService, JwtAuthGuard, RolesGuard],
})
export class VariantModule {}
