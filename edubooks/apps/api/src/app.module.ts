import { createHash } from 'crypto';
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
import { HealthController } from './health/health.controller';
import { TenantInterceptor } from './common/tenant.interceptor';
import { SystemModule } from './system/system.module';
import { CalendarModule } from './calendar/calendar.controller';
import { FlipbookModule } from './flipbook/flipbook.controller';
import { NotificationsModule } from './notifications/notifications.controller';
import { ParentsModule } from './parents/parents.controller';
import { BrandingModule } from './branding/branding.controller';
import { SalesModule } from './sales/sales.controller';
import { AttendanceModule } from './attendance/attendance.controller';
import { TrainingModule } from './training/training.controller';
import { AnalyticsModule } from './analytics/analytics.controller';
import { ExamsModule } from './exams/exams.controller';
import { MessagingModule } from './messaging/messaging.controller';
import { WhiteboardModule } from './whiteboard/whiteboard.controller';
import { AudioModule } from './audio/audio.controller';
import { MailModule } from './mail/mail.controller';
import { ProgressModule } from './progress/progress.controller';
import { SchoolBrandModule } from './schools/school-brand.controller';
import { DemoModule } from './demo/demo.controller';
import { CompanyModule } from './company/company.controller';
import { CoversModule } from './covers/covers.controller';
import { AppsModule } from './apps/apps.controller';
import { AllExceptionsFilter } from './common/pg-exception.filter';

/** Throttle key: the session cookie (hashed) when present, otherwise the client IP. */
function sessionOrIp(req: any) {
  const m = /(?:^|;\s*)eb_session=([^;]+)/.exec(req.headers?.cookie ?? '');
  return m ? `s:${createHash('sha256').update(m[1]).digest('base64url').slice(0, 22)}` : `ip:${req.ip}`;
}

@Module({
  imports: [
    // Per signed-in session (or per IP when anonymous), plus a higher per-IP ceiling: a whole school lab
    // usually shares one public IP, so the IP limit must allow many children at once.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN || 300), getTracker: sessionOrIp },
      { name: 'ip', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_IP_PER_MIN || 5000), getTracker: (req: any) => req.ip },
    ]),
    DbModule, AuditModule, AuthModule, StorageModule, CatalogModule, PublishingModule,
    CommerceModule, LicensingModule, SchoolsModule, SchoolAdminModule, LmsModule, AiModule, GamesModule, SystemModule, CalendarModule, FlipbookModule, NotificationsModule, ParentsModule, BrandingModule, SalesModule, AttendanceModule, TrainingModule, AnalyticsModule, ExamsModule, MessagingModule, WhiteboardModule, AudioModule, MailModule, ProgressModule, SchoolBrandModule, DemoModule, CompanyModule, CoversModule, AppsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
