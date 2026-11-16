import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ReviewController],
  providers: [ReviewService, RolesGuard],
  exports: [ReviewService],
})
export class ReviewModule {}
