import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // if we dont give this property transform doesnot run in dto
    }),
  );

  // to configure interceptors in all routes
  app.useGlobalInterceptors(new TransformInterceptor(new Reflector()));
  app.setGlobalPrefix('api/v1'); // to set prefix for all routes
  app.useGlobalFilters(new HttpExceptionFilter()); // to set global filters for all routes

  // Swagger API Documentation Configuration
  const config = new DocumentBuilder()
    .setTitle('E-Commerce Backend API')
    .setDescription('API documentation for NestJS E-Commerce Backend Service')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT Authorization',
        description: 'Enter JWT Token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

