import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { BrandsModule } from './brands/brands.module';
import { StoresModule } from './stores/stores.module';
import { UsersModule } from './users/users.module';
import { PlatformModule } from './platform/platform.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SizesModule } from './sizes/sizes.module';
import { AddonsModule } from './addons/addons.module';
import { PreferencesModule } from './preferences/preferences.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { InventoryModule } from './inventory/inventory.module';
import { SubmittedReportsModule } from './submitted-reports/submitted-reports.module';
import { SubmittedInventoryReportsModule } from './submitted-inventory-reports/submitted-inventory-reports.module';
import { UserShiftReportsModule } from './user-shift-reports/user-shift-reports.module';
import { UserShiftInventoryReportsModule } from './user-shift-inventory-reports/user-shift-inventory-reports.module';
import { AppReleasesModule } from './app-releases/app-releases.module';
import { StorageModule } from './storage/storage.module';
import { PriceTiersModule } from './price-tiers/price-tiers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            redact: ['req.headers.authorization'],
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: { colorize: true, singleLine: true },
                  },
                }),
          },
        };
      },
    }),

    // Global rate limiting — fully configurable via env vars
    // Defaults: 100 req/min globally, 20 login attempts per 15 min
    ThrottlerModule.forRoot([{
      ttl:   parseInt(process.env.THROTTLE_GLOBAL_TTL  ?? '60000'),
      limit: parseInt(process.env.THROTTLE_GLOBAL_LIMIT ?? '100'),
    }]),

    // Redis-backed cache — used for JWT token blacklist (logout/revocation)
    CacheModule.register({
      isGlobal: true,
      stores: [new KeyvRedis(`redis://${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`)],
    }),

    PrismaModule,
    AuthModule,

    // New hierarchy modules
    CompaniesModule,
    BrandsModule,
    StoresModule,
    UsersModule,
    PlatformModule,
    AnalyticsModule,

    // Catalog (brand-scoped)
    CategoriesModule,
    ProductsModule,
    SizesModule,
    AddonsModule,
    PreferencesModule,

    // Store operations
    TransactionsModule,
    ExpensesModule,
    ReportsModule,
    InventoryModule,
    SubmittedReportsModule,
    SubmittedInventoryReportsModule,
    UserShiftReportsModule,
    UserShiftInventoryReportsModule,

    // Price tiers (brand-scoped)
    PriceTiersModule,

    // App releases (APK auto-update)
    AppReleasesModule,

    // Object storage (MinIO)
    StorageModule,

  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guard order: throttle → JWT auth → roles
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
