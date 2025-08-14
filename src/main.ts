import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for frontend integration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://liberdus.com',
      'https://www.liberdus.com',
      'http://liberdus.com',
      'http://www.liberdus.com'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200, // For legacy browser support
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Liberdus Faucet API is running on: http://localhost:${port}`);
  logger.log(
    `📊 Health check available at: http://localhost:${port}/faucet/health`,
  );
  logger.log(`📈 Stats available at: http://localhost:${port}/faucet/stats`);
}

bootstrap();
