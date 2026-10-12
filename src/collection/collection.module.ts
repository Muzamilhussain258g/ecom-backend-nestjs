import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { MediaModule } from '@/media/media.module';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

@Module({
  imports: [PrismaModule, AuthModule, MediaModule],
  controllers: [CollectionController],
  providers: [CollectionService, RolesGuard],
})
export class CollectionModule {}
