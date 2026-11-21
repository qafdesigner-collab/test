import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { DbService } from '../db/db.service';
import { MANUAL_TX } from './decorators';

/** Wraps each authenticated request in a tenant-scoped DB transaction (see DbService). */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly db: DbService, private readonly reflector: Reflector) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!req.ctx || this.reflector.get<boolean>(MANUAL_TX, context.getHandler())) return next.handle();
    return from(this.db.withContext(req.ctx, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
