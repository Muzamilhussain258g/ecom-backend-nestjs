import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { VariantModule } from './variant/variant.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { MediaModule } from './media/media.module';
import { CollectionModule } from './collection/collection.module';

@Module({
  imports: [
    AuthModule,
    CategoryModule,
    ProductModule,
    VariantModule,
    WishlistModule,
    MediaModule,
    CollectionModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
