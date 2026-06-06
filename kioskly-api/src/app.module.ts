import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { TransactionsModule } from './transactions/transactions.module';
import { TenantsModule } from './tenants/tenants.module';  // kept as deprecated alias
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { InventoryModule } from './inventory/inventory.module';
import { SubmittedReportsModule } from './submitted-reports/submitted-reports.module';
import { SubmittedInventoryReportsModule } from './submitted-inventory-reports/submitted-inventory-reports.module';

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
            redact: ['req.headers.authorization', 'req.body.password'],
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

    // Store operations
    TransactionsModule,
    ExpensesModule,
    ReportsModule,
    InventoryModule,
    SubmittedReportsModule,
    SubmittedInventoryReportsModule,

    // Deprecated — kept for backward compat during migration
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply throttler globally (individual endpoints can override with @Throttle)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
