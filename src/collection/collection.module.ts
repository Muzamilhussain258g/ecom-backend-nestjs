import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'prisma/prisma.module';
import { MediaModule } from '@/media/media.module';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

@Module({
  imports: [PrismaModule, JwtModule.register({}), MediaModule],
  controllers: [CollectionController],
  providers: [CollectionService, JwtAuthGuard, RolesGuard],
})
export class CollectionModule {}
