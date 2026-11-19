import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PrismaModule } from 'prisma/prisma.module';
import { AdminFaqController, FaqController } from './faq.controller';
import { FaqService } from './faq.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FaqController, AdminFaqController],
  providers: [FaqService, RolesGuard],
})
export class FaqModule {}
