import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
