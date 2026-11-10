import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { StorageModule } from './storage/storage.module';
import { CatalogModule } from './catalog/catalog.module';
import { PublishingModule } from './publishing/publishing.module';
import { CommerceModule } from './commerce/commerce.module';
import { LicensingModule } from './licensing/licensing.module';
import { SchoolsModule } from './schools/schools.module';
import { SchoolAdminModule } from './school-admin/school-admin.module';
import { LmsModule } from './lms/lms.module';
import { AiModule } from './ai/ai.module';
import { GamesModule } from './games/games.module';
import { TenantInterceptor } from './common/tenant.interceptor';
import { AllExceptionsFilter } from './common/pg-exception.filter';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN || 300) }]),
    DbModule, AuditModule, AuthModule, StorageModule, CatalogModule, PublishingModule,
    CommerceModule, LicensingModule, SchoolsModule, SchoolAdminModule, LmsModule, AiModule, GamesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
