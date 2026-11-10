import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { auditLogs, users } from '../db/schema';

@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  /** Write an audit entry inside the current transaction (rolled back together with the change). */
  async log(action: string, entityType: string, entityId: string | null, summary: string, before?: unknown, after?: unknown) {
    const c = this.db.ctx;
    await this.db.q.insert(auditLogs).values({
      publisherId: c.publisherId, schoolId: c.schoolId, actorUserId: c.userId, action, entityType, entityId, summary,
      before: before === undefined ? null : (before as any), after: after === undefined ? null : (after as any), ip: c.ip,
    });
  }

  async list(f: { entityType?: string; entityId?: string; page: number; pageSize: number }) {
    const where: SQL[] = [];
    if (f.entityType) where.push(eq(auditLogs.entityType, f.entityType));
    if (f.entityId) where.push(eq(auditLogs.entityId, f.entityId));
    const w = where.length ? and(...where) : undefined;
    const items = await this.db.q.select({
      id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId,
      summary: auditLogs.summary, createdAt: auditLogs.createdAt, actor: users.displayName,
    }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).where(w)
      .orderBy(desc(auditLogs.createdAt)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const [{ n }] = await this.db.q.select({ n: count() }).from(auditLogs).where(w);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }
}
