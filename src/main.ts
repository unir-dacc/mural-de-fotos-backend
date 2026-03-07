import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { patchNestJsSwagger } from 'nestjs-zod';
import setupSwagger from 'swagger.config';
import { PrismaExceptionFilters } from './common/filters/prisma-exception.filter';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const IMAGE_DIR = join(__dirname, '..', '..', 'images');

async function bootstrap() {
  if (!existsSync(IMAGE_DIR)) {
    mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const app = await NestFactory.create(AppModule, {});

  app.setGlobalPrefix(process.env.ROUTE || '');
  app.enableCors();
  app.useGlobalFilters(new PrismaExceptionFilters());

  patchNestJsSwagger();
  setupSwagger(app);
  await app.listen(4000);
}
bootstrap();
