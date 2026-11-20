import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { Module } from '@nestjs/common';
import { AuthModule, authThrottlerGuard } from './auth';
import { DatabaseModule } from './database';
import { OrganizationsModule } from './organizations';

@Module({
  imports: [DatabaseModule, AuthModule, OrganizationsModule],
})
class AppModule {}

export async function createApp() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
  }
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalGuards(app.get(authThrottlerGuard));
  await app.init();
  return app;
}
