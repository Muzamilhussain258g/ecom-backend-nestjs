import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { VariantModule } from './variant/variant.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { MediaModule } from './media/media.module';
import { CollectionModule } from './collection/collection.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { AddressModule } from './address/address.module';
import { CartModule } from './cart/cart.module';
import { ReviewModule } from './review/review.module';
import { OrderModule } from './order/order.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { MailModule } from './mail/mail.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    CategoryModule,
    ProductModule,
    VariantModule,
    WishlistModule,
    MediaModule,
    CollectionModule,
    AiAgentModule,
    AddressModule,
    CartModule,
    ReviewModule,
    OrderModule,
    MailModule,
    UserModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.getOrThrow<string>('MAIL_HOST'),
          port: Number(config.getOrThrow<string>('MAIL_PORT')) || 587,
          auth: {
            user: config.getOrThrow<string>('MAIL_USER'),
            pass: config.getOrThrow<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: config.get('MAIL_FROM'),
        },
        template: {
          dir: existsSync(join(__dirname, 'templates'))
            ? join(__dirname, 'templates')
            : join(process.cwd(), 'src', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
