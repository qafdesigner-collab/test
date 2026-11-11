import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { IS_PUBLIC, ROLES } from '../common/decorators';
import { config } from '../config';

export const SESSION_COOKIE = 'eb_session';
export const hashToken = (t: string) => createHash('sha256').update(t).digest();
export const STAFF_ROLES = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES'];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly db: DbService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (token && token.length < 200) {
      const { rows } = await this.db.root.execute(sql`SELECT * FROM auth_session(${hashToken(token)}, ${config.sessionIdleMinutes})`);
      const s = rows[0] as any;
      if (s) {
        req.me = s;
        req.ctx = {
          userId: s.user_id, publisherId: s.publisher_id, schoolId: s.school_id, roles: s.roles,
          staff: s.roles.some((r: string) => STAFF_ROLES.includes(r)), ip: req.ip, sessionId: s.session_id,
        };
      }
    }
    if (isPublic) return true;
    if (!req.ctx) throw new UnauthorizedException('Please log in');
    const required = this.reflector.getAllAndOverride<string[]>(ROLES, [context.getHandler(), context.getClass()]);
    if (required?.length && !req.ctx.roles.some((r: string) => required.includes(r))) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return true;
  }
}
