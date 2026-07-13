import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // if we dont give this property transform doesnot run in dto
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
