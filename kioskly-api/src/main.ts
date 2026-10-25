import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MulterExceptionFilter } from './common/filters/multer-exception.filter';
import { jsonBodyParser } from './common/utils/json-body-parser.util';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  // Behind nginx (single hop, sets X-Forwarded-For): use the real client IP
  // for rate limiting — otherwise every visitor of the public pay page (and
  // every login) shares nginx's address and one throttle bucket.
  app.set('trust proxy', 1);

  // Explicit body size limits — disables NestJS's unlimited default. Billing
  // webhooks get a small limit and keep their raw body for signature checks.
  app.use(jsonBodyParser());
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
  app.useGlobalFilters(new MulterExceptionFilter());

  // Security headers (helmet must come before CORS)
  // crossOriginResourcePolicy set to cross-origin so logo/image uploads can load
  // from company and brand portal subdomains (different origin than the API)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  }));

  // API prefix — all routes under /api/v1; health check excluded for load balancers
  const globalPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(globalPrefix, {
    exclude: ['health'],
  });

  // Fallback for old /uploads/* URLs in DB — remove after running migrate:minio
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // CORS — supports exact origins and wildcard patterns (e.g. http://*.kioscify.localhost)
  // Set ALLOWED_ORIGINS as a comma-separated list in .env.
  // Leave unset to allow all origins in development.
  const rawOrigins = process.env.ALLOWED_ORIGINS;

  const originHandler = rawOrigins
    ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Non-browser requests (curl, Postman, server-to-server) have no origin
        if (!origin) return callback(null, true);
        const allowed = rawOrigins.split(',').some((pattern) => {
          const p = pattern.trim();
          if (p.includes('*')) {
            const regex = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
            return regex.test(origin);
          }
          return p === origin;
        });
        callback(allowed ? null : new Error(`CORS: origin ${origin} not allowed`), allowed);
      }
    : true;

  app.enableCors({
    origin: originHandler,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
    .addTag('analytics', 'Company-level franchise analytics')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env.PORT ?? 3000;
  const logger = app.get(Logger);
  await app.listen(port);
  logger.log(`🚀 Kioscify API running on: http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/${globalPrefix}/docs`);
}

void bootstrap();
