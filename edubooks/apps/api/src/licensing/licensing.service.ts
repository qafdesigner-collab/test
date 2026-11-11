import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import {
  academicYears, accessEntitlements, bookEditions, bookPackages, bundleItems, grades, licenseAdjustments, licenseAssignments, licensePools,
  licenseSeats, licenseTransfers, productVersions, products, schools, subjects, userRoles, users,
} from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { CommerceService } from '../commerce/commerce.service';

type Pool = typeof licensePools.$inferSelect;
const LIVE = ['ACTIVE', 'SUSPENDED'] as const;

@Injectable()
export class LicensingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Licensing');
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly commerce: CommerceService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }

  // ---------- automatic expiry ----------
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_JOBS === '1') return;
    const run = () => this.expireNow()
      .then(() => this.db.root.execute(sql`SELECT purge_sessions()`))
      .catch((e) => this.log.error(`maintenance job failed: ${e.message}`));
    run();
    this.timer = setInterval(run, Number(process.env.EXPIRY_JOB_MINUTES || 60) * 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  /** Marks ended licence periods as EXPIRED (history is kept). Access checks never depend on this job having run. */
  async expireNow() {
    const { rows } = await this.db.root.execute(sql`SELECT expire_licences() AS n`);
    const n = Number((rows[0] as any).n);
    if (n) this.log.log(`expired ${n} licence pool(s)`);
    return n;
  }

  // ---------- reading pools ----------
  private poolSelect() {
    return {
      id: licensePools.id, schoolId: licensePools.schoolId, seatType: licensePools.seatType, quantity: licensePools.quantity, status: licensePools.status,
      validFrom: licensePools.validFrom, validUntil: licensePools.validUntil, createdAt: licensePools.createdAt,
      source: sql<string>`CASE WHEN ${licensePools.fulfillmentId} IS NOT NULL THEN 'ORDER' ELSE 'ADJUSTMENT' END`,
      orderNo: sql<string | null>`(SELECT o.order_no FROM fulfillments f JOIN order_lines l ON l.id = f.order_line_id JOIN orders o ON o.id = l.order_id WHERE f.id = ${qc(licensePools.fulfillmentId)})`,
      adjustment: sql<any>`(SELECT json_build_object('kind', a.kind, 'reason', a.reason) FROM license_adjustments a WHERE a.id = ${qc(licensePools.adjustmentId)})`,
      productVersionId: licensePools.productVersionId, productName: products.name, sku: products.sku, productKind: products.kind, versionNo: productVersions.versionNo,
      schoolName: schools.name, schoolCode: schools.code, academicYear: academicYears.name,
      assigned: sql<number>`(SELECT count(*)::int FROM license_assignments a WHERE a.pool_id = ${qc(licensePools.id)} AND a.status = 'ACTIVE')`,
      suspended: sql<number>`(SELECT count(*)::int FROM license_assignments a WHERE a.pool_id = ${qc(licensePools.id)} AND a.status = 'SUSPENDED')`,
      available: sql<number>`(SELECT count(*)::int FROM license_seats s WHERE s.pool_id = ${qc(licensePools.id)} AND s.status = 'AVAILABLE')`,
      revoked: sql<number>`(SELECT count(*)::int FROM license_seats s WHERE s.pool_id = ${qc(licensePools.id)} AND s.status = 'REVOKED')`,
      books: sql<string[]>`(SELECT array_agg(bp.title ORDER BY bp.title) FROM bundle_items b JOIN book_editions e ON e.id = b.edition_id
        JOIN book_packages bp ON bp.id = e.package_id WHERE b.product_version_id = ${qc(licensePools.productVersionId)})`,
    };
  }

  async listPools(f: { schoolId?: string; status?: string; seatType?: string }) {
    const w: SQL[] = [];
    if (f.schoolId) w.push(eq(licensePools.schoolId, f.schoolId));
    if (f.status) w.push(eq(licensePools.status, f.status as any));
    if (f.seatType) w.push(eq(licensePools.seatType, f.seatType as any));
    return this.q.select(this.poolSelect()).from(licensePools)
      .innerJoin(productVersions, eq(productVersions.id, licensePools.productVersionId)).innerJoin(products, eq(products.id, productVersions.productId))
      .innerJoin(schools, eq(schools.id, licensePools.schoolId)).innerJoin(academicYears, eq(academicYears.id, licensePools.academicYearId))
      .where(w.length ? and(...w) : undefined).orderBy(asc(schools.name), desc(licensePools.validUntil), asc(products.name), asc(licensePools.seatType));
  }

  async getPool(id: string) {
    const [pool] = (await this.q.select(this.poolSelect()).from(licensePools)
      .innerJoin(productVersions, eq(productVersions.id, licensePools.productVersionId)).innerJoin(products, eq(products.id, productVersions.productId))
      .innerJoin(schools, eq(schools.id, licensePools.schoolId)).innerJoin(academicYears, eq(academicYears.id, licensePools.academicYearId))
      .where(eq(licensePools.id, id)));
    if (!pool) throw new NotFoundException('Licence pool not found');
    const assignments = await this.q.select({
      id: licenseAssignments.id, status: licenseAssignments.status, assignedAt: licenseAssignments.assignedAt, endedAt: licenseAssignments.endedAt,
      endReason: licenseAssignments.endReason, seatNo: licenseSeats.seatNo, userId: users.id, displayName: users.displayName, username: users.username,
      pendingTransfer: sql<boolean>`EXISTS (SELECT 1 FROM license_transfers t WHERE t.assignment_id = ${qc(licenseAssignments.id)} AND t.status = 'PENDING')`,
    }).from(licenseAssignments).innerJoin(licenseSeats, eq(licenseSeats.id, licenseAssignments.seatId)).innerJoin(users, eq(users.id, licenseAssignments.userId))
      .where(eq(licenseAssignments.poolId, id)).orderBy(asc(licenseSeats.seatNo), desc(licenseAssignments.assignedAt));
    return { ...pool, assignments };
  }

  /** Users of the pool's school who could receive a seat from this pool. */
  async eligibleUsers(poolId: string) {
    const [pool] = await this.q.select().from(licensePools).where(eq(licensePools.id, poolId));
    if (!pool) throw new NotFoundException('Licence pool not found');
    const role = pool.seatType === 'STUDENT' ? 'STUDENT' : 'TEACHER';
    return this.q.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, role)))
      .where(and(eq(users.schoolId, pool.schoolId), eq(users.status, 'ACTIVE'),
        sql`NOT EXISTS (SELECT 1 FROM license_assignments a WHERE a.pool_id = ${pool.id} AND a.user_id = ${qc(users.id)} AND a.status IN ('ACTIVE','SUSPENDED'))`))
      .orderBy(asc(users.displayName));
  }

  // ---------- core: atomic seat assignment ----------
  private async grantEntitlements(assignmentId: string, pool: Pool, userId: string) {
    const items = await this.q.select({ editionId: bundleItems.editionId }).from(bundleItems).where(eq(bundleItems.productVersionId, pool.productVersionId));
    if (!items.length) return;
    await this.q.insert(accessEntitlements).values(items.map((i) => ({
      publisherId: pool.publisherId, schoolId: pool.schoolId, userId, editionId: i.editionId, assignmentId, validUntil: pool.validUntil,
    }))).onConflictDoUpdate({ target: [accessEntitlements.assignmentId, accessEntitlements.editionId], set: { active: true } });
  }
  private async setEntitlements(assignmentId: string, active: boolean) {
    await this.q.update(accessEntitlements).set({ active }).where(eq(accessEntitlements.assignmentId, assignmentId));
  }

  private async lockablePool(poolId: string) {
    const [pool] = await this.q.select().from(licensePools).where(eq(licensePools.id, poolId));
    if (!pool) throw new NotFoundException('Licence pool not found');
    if (this.ctx.schoolId && pool.schoolId !== this.ctx.schoolId) throw new ForbiddenException();
    if (pool.status !== 'ACTIVE') throw new ConflictException(`This licence pool is ${pool.status.toLowerCase()} — seats cannot be assigned.`);
    if (pool.validUntil <= new Date()) throw new ConflictException('This licence period has ended. A renewal order is needed.');
    return pool;
  }

  private async assertEligible(pool: Pool, userIds: string[]) {
    const role = pool.seatType === 'STUDENT' ? 'STUDENT' : 'TEACHER';
    const rows = await this.q.select({ id: users.id, schoolId: users.schoolId, status: users.status, name: users.displayName,
      hasRole: sql<boolean>`EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ${qc(users.id)} AND r.role = ${role})` })
      .from(users).where(inArray(users.id, userIds));
    for (const id of userIds) {
      const u = rows.find((r) => r.id === id);
      if (!u || u.schoolId !== pool.schoolId) throw new BadRequestException('One of the selected users does not belong to this school.');
      if (u.status !== 'ACTIVE') throw new BadRequestException(`${u.name} is not an active account.`);
      if (!u.hasRole) throw new BadRequestException(`${u.name} is not a ${role.toLowerCase()} — ${pool.seatType.toLowerCase()} seats can only go to ${role.toLowerCase()}s.`);
    }
    return rows;
  }

  /**
   * Assign seats to users — all or nothing, inside the request transaction.
   * Concurrency: each seat row is locked with FOR UPDATE SKIP LOCKED, so two simultaneous requests can never take
   * the same seat, and capacity can never be exceeded (seats are finite rows). Partial unique indexes back this up.
   */
  async assign(poolId: string, userIds: string[]) {
    const ids = [...new Set(userIds)];
    if (!ids.length) throw new BadRequestException('Select at least one person.');
    const pool = await this.lockablePool(poolId);
    const people = await this.assertEligible(pool, ids);
    const created = [];
    for (const userId of ids) {
      const [dup] = await this.q.select({ id: licenseAssignments.id }).from(licenseAssignments)
        .where(and(eq(licenseAssignments.poolId, pool.id), eq(licenseAssignments.userId, userId), inArray(licenseAssignments.status, [...LIVE])));
      if (dup) throw new ConflictException(`${people.find((p) => p.id === userId)!.name} already holds a seat in this licence.`);
      const { rows } = await this.q.execute(sql`SELECT id, seat_no FROM license_seats WHERE pool_id = ${pool.id} AND status = 'AVAILABLE'
        ORDER BY seat_no LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const seat = rows[0] as { id: string; seat_no: number } | undefined;
      if (!seat) throw new ConflictException(`No ${pool.seatType.toLowerCase()} seats left in this licence (${pool.quantity} purchased). A new or additional order is needed.`);
      await this.q.update(licenseSeats).set({ status: 'ASSIGNED' }).where(eq(licenseSeats.id, seat.id));
      const [a] = await this.q.insert(licenseAssignments).values({
        publisherId: pool.publisherId, schoolId: pool.schoolId, poolId: pool.id, seatId: seat.id, userId, assignedBy: this.ctx.userId,
      }).returning();
      await this.grantEntitlements(a.id, pool, userId);
      created.push({ assignmentId: a.id, userId, seatNo: seat.seat_no });
    }
    await this.audit.log('licensing.seat.assign', 'license_pool', pool.id,
      `Assigned ${created.length} ${pool.seatType.toLowerCase()} seat(s): ${people.map((p) => p.name).join(', ')}`, undefined, created, pool.schoolId);
    return { assigned: created };
  }

  private async assignment(id: string) {
    const [a] = await this.q.select({ a: licenseAssignments, pool: licensePools, name: users.displayName }).from(licenseAssignments)
      .innerJoin(licensePools, eq(licensePools.id, licenseAssignments.poolId)).innerJoin(users, eq(users.id, licenseAssignments.userId))
      .where(eq(licenseAssignments.id, id)).for('update', { of: licenseAssignments });
    if (!a) throw new NotFoundException('Seat assignment not found');
    if (this.ctx.schoolId && a.a.schoolId !== this.ctx.schoolId) throw new ForbiddenException();
    return a;
  }
  private async endAssignment(id: string, status: 'RELEASED' | 'REVOKED' | 'TRANSFERRED', reason: string) {
    const { a, pool, name } = await this.assignment(id);
    if (!LIVE.includes(a.status as any)) throw new ConflictException(`This seat assignment is already ${a.status.toLowerCase()}.`);
    await this.q.update(licenseAssignments).set({ status, endedAt: new Date(), endReason: reason }).where(eq(licenseAssignments.id, id));
    await this.setEntitlements(id, false);
    if (status !== 'TRANSFERRED') await this.q.update(licenseSeats).set({ status: 'AVAILABLE' }).where(eq(licenseSeats.id, a.seatId));
    // Pending transfer requests for this assignment become moot.
    if (status !== 'TRANSFERRED') await this.q.update(licenseTransfers).set({ status: 'CANCELLED', decidedAt: new Date(), decisionNote: `Seat ${status.toLowerCase()}` })
      .where(and(eq(licenseTransfers.assignmentId, id), eq(licenseTransfers.status, 'PENDING')));
    return { a, pool, name };
  }

  /** School admins may free TEACHER seats (staff changes). Student seats move only through publisher-approved transfers. */
  async release(id: string, reason: string) {
    const { a } = await this.assignment(id);
    if (this.ctx.schoolId && a.poolId) {
      const [p] = await this.q.select({ seatType: licensePools.seatType }).from(licensePools).where(eq(licensePools.id, a.poolId));
      if (p.seatType === 'STUDENT') throw new ForbiddenException('Student seats cannot be released by the school. Request a transfer — it needs publisher approval.');
    }
    const { pool, name } = await this.endAssignment(id, 'RELEASED', reason || 'Released by school');
    await this.audit.log('licensing.seat.release', 'license_pool', pool.id, `Released ${pool.seatType.toLowerCase()} seat of ${name}`, undefined, { assignmentId: id, reason }, pool.schoolId);
    return { ok: true };
  }

  async revoke(id: string, reason: string) {
    const { pool, name } = await this.endAssignment(id, 'REVOKED', reason);
    await this.audit.log('licensing.seat.revoke', 'license_pool', pool.id, `Revoked seat of ${name}: ${reason}`, undefined, { assignmentId: id }, pool.schoolId);
    return { ok: true };
  }

  async setAssignmentSuspended(id: string, suspend: boolean, reason?: string) {
    const { a, pool, name } = await this.assignment(id);
    if (a.status !== (suspend ? 'ACTIVE' : 'SUSPENDED')) throw new ConflictException(`Assignment is ${a.status.toLowerCase()}.`);
    await this.q.update(licenseAssignments).set({ status: suspend ? 'SUSPENDED' : 'ACTIVE' }).where(eq(licenseAssignments.id, id));
    await this.setEntitlements(id, !suspend);
    await this.audit.log(suspend ? 'licensing.seat.suspend' : 'licensing.seat.reactivate', 'license_pool', pool.id,
      `${suspend ? 'Suspended' : 'Reactivated'} seat of ${name}${reason ? `: ${reason}` : ''}`, undefined, { assignmentId: id }, pool.schoolId);
    return { ok: true };
  }

  async setPoolSuspended(id: string, suspend: boolean, reason?: string) {
    const [p] = await this.q.select().from(licensePools).where(eq(licensePools.id, id));
    if (!p) throw new NotFoundException('Licence pool not found');
    if (p.status !== (suspend ? 'ACTIVE' : 'SUSPENDED')) throw new ConflictException(`Pool is ${p.status.toLowerCase()}.`);
    await this.q.update(licensePools).set({ status: suspend ? 'SUSPENDED' : 'ACTIVE' }).where(eq(licensePools.id, id));
    await this.audit.log(suspend ? 'licensing.pool.suspend' : 'licensing.pool.reactivate', 'license_pool', id,
      `${suspend ? 'Suspended' : 'Reactivated'} ${p.quantity} ${p.seatType.toLowerCase()} seats${reason ? `: ${reason}` : ''}`, undefined, undefined, p.schoolId);
    return { ok: true };
  }

  /** Revoke unassigned seats (e.g. a partial refund). Capacity shrinks; history stays. */
  async revokeUnassignedSeats(poolId: string, count: number, reason: string) {
    const [p] = await this.q.select().from(licensePools).where(eq(licensePools.id, poolId));
    if (!p) throw new NotFoundException('Licence pool not found');
    const { rows } = await this.q.execute(sql`UPDATE license_seats SET status = 'REVOKED' WHERE id IN (
      SELECT id FROM license_seats WHERE pool_id = ${poolId} AND status = 'AVAILABLE' ORDER BY seat_no DESC LIMIT ${count} FOR UPDATE SKIP LOCKED) RETURNING id`);
    if (rows.length < count) throw new ConflictException(`Only ${rows.length} unassigned seat(s) are available to revoke.`);
    await this.audit.log('licensing.seat.revoke_unassigned', 'license_pool', poolId, `Revoked ${count} unassigned ${p.seatType.toLowerCase()} seat(s): ${reason}`, undefined, undefined, p.schoolId);
    return { ok: true };
  }

  // ---------- adjustments (traceable source for non-order seats) ----------
  async createAdjustment(d: { schoolId: string; academicYearId: string; productVersionId: string; seatType: 'STUDENT' | 'TEACHER'; quantity: number;
    kind: 'COMPLIMENTARY' | 'TRIAL' | 'CORRECTION'; reason: string; validUntil?: string }) {
    const [ay] = await this.q.select().from(academicYears).where(and(eq(academicYears.id, d.academicYearId), eq(academicYears.schoolId, d.schoolId)));
    if (!ay) throw new BadRequestException('Academic year does not belong to this school');
    const [v] = await this.q.select().from(productVersions).where(eq(productVersions.id, d.productVersionId));
    if (!v || v.status === 'DRAFT') throw new BadRequestException('Choose an active (or retired) product version');
    const validUntil = d.validUntil ? new Date(d.validUntil) : ay.endsOn;
    if (validUntil <= new Date()) throw new BadRequestException('The validity date must be in the future');
    const [adj] = await this.q.insert(licenseAdjustments).values({
      publisherId: this.ctx.publisherId, schoolId: d.schoolId, academicYearId: ay.id, productVersionId: v.id, seatType: d.seatType, quantity: d.quantity,
      kind: d.kind, reason: d.reason, validUntil, approvedBy: this.ctx.userId,
    }).returning();
    const [pool] = await this.q.insert(licensePools).values({
      publisherId: this.ctx.publisherId, schoolId: d.schoolId, academicYearId: ay.id, productVersionId: v.id, seatType: d.seatType, quantity: d.quantity,
      adjustmentId: adj.id, validFrom: new Date() < ay.startsOn ? ay.startsOn : new Date(Math.min(Date.now(), validUntil.getTime() - 1000)), validUntil,
    }).returning();
    await this.commerce.createSeats(pool.id, d.schoolId, d.quantity);
    await this.audit.log('licensing.adjustment.create', 'license_pool', pool.id, `${d.kind.toLowerCase()} adjustment: +${d.quantity} ${d.seatType.toLowerCase()} seats — ${d.reason}`, undefined, adj, d.schoolId);
    return { adjustment: adj, poolId: pool.id };
  }

  // ---------- transfers (publisher approval required) ----------
  async requestTransfer(assignmentId: string, toUserId: string, reason: string) {
    const { a, pool, name } = await this.assignment(assignmentId);
    if (!LIVE.includes(a.status as any)) throw new ConflictException('Only a current seat can be transferred.');
    if (toUserId === a.userId) throw new BadRequestException('Choose a different person.');
    const [to] = await this.assertEligible(pool, [toUserId]);
    const [exists] = await this.q.select({ id: licenseAssignments.id }).from(licenseAssignments)
      .where(and(eq(licenseAssignments.poolId, pool.id), eq(licenseAssignments.userId, toUserId), inArray(licenseAssignments.status, [...LIVE])));
    if (exists) throw new ConflictException(`${to.name} already holds a seat in this licence.`);
    const [t] = await this.q.insert(licenseTransfers).values({
      publisherId: pool.publisherId, schoolId: pool.schoolId, assignmentId, toUserId, reason, requestedBy: this.ctx.userId,
    }).returning();
    await this.audit.log('licensing.transfer.request', 'license_transfer', t.id, `Requested transfer of ${name}'s seat to ${to.name}: ${reason}`, undefined, t, pool.schoolId);
    return t;
  }

  async listTransfers(f: { status?: string; schoolId?: string }) {
    const w: SQL[] = [];
    if (f.status) w.push(eq(licenseTransfers.status, f.status as any));
    if (f.schoolId) w.push(eq(licenseTransfers.schoolId, f.schoolId));
    return this.q.select({
      id: licenseTransfers.id, status: licenseTransfers.status, reason: licenseTransfers.reason, requestedAt: licenseTransfers.requestedAt,
      decidedAt: licenseTransfers.decidedAt, decisionNote: licenseTransfers.decisionNote, assignmentId: licenseTransfers.assignmentId,
      schoolName: schools.name, schoolCode: schools.code,
      fromUser: sql<string>`(SELECT u.display_name FROM license_assignments a JOIN users u ON u.id = a.user_id WHERE a.id = ${qc(licenseTransfers.assignmentId)})`,
      toUser: sql<string>`(SELECT display_name FROM users WHERE id = ${qc(licenseTransfers.toUserId)})`,
      product: sql<string>`(SELECT p.name || ' v' || v.version_no FROM license_assignments a JOIN license_pools lp ON lp.id = a.pool_id
        JOIN product_versions v ON v.id = lp.product_version_id JOIN products p ON p.id = v.product_id WHERE a.id = ${qc(licenseTransfers.assignmentId)})`,
      requestedBy: sql<string>`(SELECT display_name FROM users WHERE id = ${qc(licenseTransfers.requestedBy)})`,
    }).from(licenseTransfers).innerJoin(schools, eq(schools.id, licenseTransfers.schoolId))
      .where(w.length ? and(...w) : undefined).orderBy(desc(licenseTransfers.requestedAt)).limit(200);
  }

  private async transfer(id: string) {
    const [t] = await this.q.select().from(licenseTransfers).where(eq(licenseTransfers.id, id)).for('update');
    if (!t) throw new NotFoundException('Transfer request not found');
    if (this.ctx.schoolId && t.schoolId !== this.ctx.schoolId) throw new ForbiddenException();
    if (t.status !== 'PENDING') throw new ConflictException(`This request was already ${t.status.toLowerCase()}.`);
    return t;
  }

  /** Approval moves the SAME seat to the new person in one transaction; the old assignment is kept as history. */
  async approveTransfer(id: string, note?: string) {
    const t = await this.transfer(id);
    const { a, pool, name } = await this.endAssignment(t.assignmentId, 'TRANSFERRED', `Transferred (request ${t.id.slice(0, 8)})`);
    if (pool.status !== 'ACTIVE' || pool.validUntil <= new Date()) throw new ConflictException('The licence pool is not active any more.');
    const [to] = await this.assertEligible(pool, [t.toUserId]);
    const [na] = await this.q.insert(licenseAssignments).values({
      publisherId: pool.publisherId, schoolId: pool.schoolId, poolId: pool.id, seatId: a.seatId, userId: t.toUserId, assignedBy: this.ctx.userId, transferredFromId: a.id,
    }).returning();
    await this.grantEntitlements(na.id, pool, t.toUserId);
    await this.q.update(licenseTransfers).set({ status: 'APPROVED', decidedBy: this.ctx.userId, decidedAt: new Date(), decisionNote: note ?? null, newAssignmentId: na.id })
      .where(eq(licenseTransfers.id, id));
    await this.audit.log('licensing.transfer.approve', 'license_transfer', id, `Approved transfer of seat from ${name} to ${to.name}`, undefined, { newAssignmentId: na.id }, pool.schoolId);
    return { ok: true, newAssignmentId: na.id };
  }

  async decideTransfer(id: string, status: 'REJECTED' | 'CANCELLED', note?: string) {
    const t = await this.transfer(id);
    if (status === 'CANCELLED' && !this.ctx.schoolId && !this.ctx.staff) throw new ForbiddenException();
    await this.q.update(licenseTransfers).set({ status, decidedBy: this.ctx.userId, decidedAt: new Date(), decisionNote: note ?? null }).where(eq(licenseTransfers.id, id));
    await this.audit.log(`licensing.transfer.${status.toLowerCase()}`, 'license_transfer', id, `${status === 'REJECTED' ? 'Rejected' : 'Cancelled'} transfer request${note ? `: ${note}` : ''}`, undefined, undefined, t.schoolId);
    return { ok: true };
  }

  // ---------- dashboard ----------
  async dashboard(schoolId?: string) {
    const pools = await this.listPools({ schoolId });
    const now = Date.now();
    const sum = (fn: (p: (typeof pools)[number]) => number) => pools.reduce((n, p) => n + fn(p), 0);
    const live = (p: (typeof pools)[number]) => p.status === 'ACTIVE' && new Date(p.validUntil).getTime() > now;
    const totals = (type: 'STUDENT' | 'TEACHER') => {
      const ps = pools.filter((p) => p.seatType === type);
      const s = (fn: (p: (typeof pools)[number]) => number) => ps.reduce((n, p) => n + fn(p), 0);
      return {
        purchased: s((p) => p.quantity),
        assigned: s((p) => (live(p) ? p.assigned : 0)),
        available: s((p) => (live(p) ? p.available : 0)),
        suspended: s((p) => (p.status === 'SUSPENDED' ? p.quantity - p.revoked : p.suspended)),
        expired: s((p) => (p.status === 'EXPIRED' || (p.status === 'ACTIVE' && !live(p)) ? p.quantity - p.revoked : 0)),
        revoked: s((p) => p.revoked),
      };
    };
    const soon = pools.filter((p) => live(p) && new Date(p.validUntil).getTime() - now < 45 * 864e5);
    const pending = await this.listTransfers({ status: 'PENDING', schoolId });
    return { students: totals('STUDENT'), teachers: totals('TEACHER'), poolCount: pools.length, expiringSoon: soon, pendingTransfers: pending.length, totalSeats: sum((p) => p.quantity) };
  }

  /** Usage report by school × product (CSV-friendly rows). */
  async usageReport() {
    const pools = await this.listPools({});
    const map = new Map<string, any>();
    for (const p of pools) {
      const k = `${p.schoolId}|${p.productVersionId}|${p.academicYear}`;
      const r = map.get(k) ?? { school: p.schoolName, code: p.schoolCode, product: `${p.productName} v${p.versionNo}`, sku: p.sku, academicYear: p.academicYear,
        validUntil: p.validUntil, studentSeats: 0, studentAssigned: 0, teacherSeats: 0, teacherAssigned: 0, status: p.status };
      if (p.seatType === 'STUDENT') { r.studentSeats += p.quantity - p.revoked; r.studentAssigned += p.assigned; } else { r.teacherSeats += p.quantity - p.revoked; r.teacherAssigned += p.assigned; }
      map.set(k, r);
    }
    return [...map.values()];
  }

  // ---------- library & content access ----------
  /** Editions the current user may open. Duplicate grants (e.g. a bundle + a single book) collapse to one entry. */
  async library() {
    const c = this.ctx;
    const isSchoolAdmin = c.roles.includes('SCHOOL_ADMIN');
    const editionIds = await this.entitledEditionIds(c.userId, isSchoolAdmin ? c.schoolId : null);
    if (!editionIds.length) return [];
    return this.q.select({
      editionId: bookEditions.id, editionLabel: bookEditions.label, packageId: bookPackages.id, title: bookPackages.title, coverColor: bookPackages.coverColor,
      description: bookPackages.description, grade: grades.name, subject: subjects.name,
      validUntil: sql<string>`(SELECT max(e.valid_until) FROM access_entitlements e WHERE e.edition_id = ${qc(bookEditions.id)} AND e.user_id = ${c.userId})`,
    }).from(bookEditions).innerJoin(bookPackages, eq(bookPackages.id, bookEditions.packageId))
      .innerJoin(grades, eq(grades.id, bookPackages.gradeId)).innerJoin(subjects, eq(subjects.id, bookPackages.subjectId))
      .where(inArray(bookEditions.id, editionIds)).orderBy(asc(grades.sort), asc(subjects.sort));
  }

  /** Live entitlements = active entitlement + active assignment + active, unexpired pool (checked at query time). */
  async entitledEditionIds(userId: string, schoolAdminOf?: string | null): Promise<string[]> {
    if (schoolAdminOf) {
      const { rows } = await this.q.execute(sql`SELECT DISTINCT b.edition_id FROM license_pools p JOIN bundle_items b ON b.product_version_id = p.product_version_id
        WHERE p.school_id = ${schoolAdminOf} AND p.status = 'ACTIVE' AND p.valid_until > now()`);
      return rows.map((r: any) => r.edition_id);
    }
    const { rows } = await this.q.execute(sql`SELECT DISTINCT e.edition_id FROM access_entitlements e
      JOIN license_assignments a ON a.id = e.assignment_id AND a.status = 'ACTIVE'
      JOIN license_pools p ON p.id = a.pool_id AND p.status = 'ACTIVE' AND p.valid_until > now()
      WHERE e.user_id = ${userId} AND e.active AND e.valid_until > now()`);
    return rows.map((r: any) => r.edition_id);
  }

  /** May the current (school) user open this asset? Checks entitlement + resource audience. */
  async canAccessAsset(assetId: string): Promise<boolean> {
    const c = this.ctx;
    if (c.staff) return true;
    const isSchoolAdmin = c.roles.includes('SCHOOL_ADMIN');
    const editions = await this.entitledEditionIds(c.userId, isSchoolAdmin ? c.schoolId : null);
    if (!editions.length) return false;
    const audiences = c.roles.includes('STUDENT') ? ['ALL', 'STUDENT'] : ['ALL', 'TEACHER', 'STUDENT'];
    const { rows } = await this.q.execute(sql`SELECT 1 FROM teaching_resources r WHERE r.asset_id = ${assetId}
        AND r.edition_id IN ${editions} AND r.audience::text IN ${audiences}
      UNION ALL SELECT 1 FROM book_components bc WHERE bc.book_asset_id = ${assetId} AND bc.edition_id IN ${editions} LIMIT 1`);
    return rows.length > 0;
  }
}
