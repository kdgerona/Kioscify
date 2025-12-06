import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files for uploaded logos
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // Enable CORS for React Native app
  app.enableCors({
    origin: true, // Allow all origins in development - restrict in production
    credentials: true,
  });

  // Enable validation pipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Kioskly POS API')
    .setDescription('API for Kioskly Point of Sale application')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('tenants', 'Multi-tenant management')
    .addTag('categories', 'Product categories management')
    .addTag('products', 'Products management')
    .addTag('sizes', 'Size options management')
    .addTag('addons', 'Add-ons management')
    .addTag('transactions', 'Transactions and sales')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`\n🚀 Kioskly API is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api\n`);
}

void bootstrap();
