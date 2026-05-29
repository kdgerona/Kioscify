import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers (helmet must come before CORS)
  app.use(helmet());

  // API prefix — all routes under /api/v1; health check excluded for load balancers
  const globalPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(globalPrefix, {
    exclude: ['health'],
  });

  // Serve static uploads
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // CORS — restrict to known portal origins in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true; // allow all in development

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-company-slug'],
  });

  // Global validation pipe — strip unknown fields, transform types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Kioscify API')
    .setDescription('Kioscify Store Management & Monitoring Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication — store, company, and platform login')
    .addTag('platform', 'Platform Admin — Kioscify internal (PLATFORM_ADMIN only)')
    .addTag('companies', 'Company management')
    .addTag('brands', 'Brand management')
    .addTag('stores', 'Store management (was: tenants)')
    .addTag('users', 'User management (store and company level)')
    .addTag('categories', 'Product categories (brand-scoped)')
    .addTag('products', 'Products (brand-scoped)')
    .addTag('sizes', 'Sizes (brand-scoped)')
    .addTag('addons', 'Add-ons (brand-scoped)')
    .addTag('transactions', 'Sales transactions (store-scoped)')
    .addTag('expenses', 'Expenses (store-scoped)')
    .addTag('inventory', 'Inventory management')
    .addTag('reports', 'Analytics and reporting')
    .addTag('submitted-reports', 'Daily submitted reports')
    .addTag('submitted-inventory-reports', 'Inventory submitted reports')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`\n🚀 Kioscify API running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/${globalPrefix}/docs\n`);
}

void bootstrap();
