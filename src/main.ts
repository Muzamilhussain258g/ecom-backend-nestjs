import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // if we dont give this property transform doesnot run in dto
    }),
  );

  // to configure interceptors in all routes
  app.useGlobalInterceptors(new TransformInterceptor(new Reflector))
  app.setGlobalPrefix('api/v1'); // to set prefix for all routes
  app.useGlobalFilters(new HttpExceptionFilter()); // to set global filters for all routes

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
