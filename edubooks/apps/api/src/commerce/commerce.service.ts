import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, max, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import {
  academicYears, bookEditions, bookPackages, bundleItems, fulfillments, grades, licensePools, licenseSeats, orderLines, orders,
  productVersions, products, schools,
} from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { CreateOrderDto, CreateProductDto, OrderLineDto, OrderQuery, ProductQuery, UpdateOrderDto, UpdateProductDto, UpdateVersionDto } from './commerce.dto';

@Injectable()
export class CommerceService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}
  private get q() { return this.db.q; }
  private get pub() { return this.db.ctx.publisherId; }

  // ======================= products & versions =======================
  async listProducts(f: ProductQuery) {
    const w: SQL[] = [];
    if (f.search) w.push(or(ilike(products.name, `%${f.search}%`), ilike(products.sku, `%${f.search}%`))!);
    if (f.kind) w.push(eq(products.kind, f.kind));
    if (f.includeArchived !== 'true') w.push(eq(products.archived, false));
    const where = w.length ? and(...w) : undefined;
    const items = await this.q.select({
      id: products.id, sku: products.sku, name: products.name, kind: products.kind, archived: products.archived, description: products.description,
      gradeName: grades.name,
      active: sql<any>`(SELECT json_build_object('id', v.id, 'versionNo', v.version_no, 'priceMinor', v.price_minor, 'currency', v.currency,
        'items', (SELECT count(*) FROM bundle_items b WHERE b.product_version_id = v.id))
        FROM product_versions v WHERE v.product_id = ${qc(products.id)} AND v.status = 'ACTIVE')`,
      hasDraft: sql<boolean>`EXISTS (SELECT 1 FROM product_versions v WHERE v.product_id = ${qc(products.id)} AND v.status = 'DRAFT')`,
      versionCount: sql<number>`(SELECT count(*)::int FROM product_versions v WHERE v.product_id = ${qc(products.id)})`,
    }).from(products).leftJoin(grades, eq(grades.id, products.gradeId)).where(where)
      .orderBy(asc(products.kind), asc(products.name)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const [{ n }] = await this.q.select({ n: count() }).from(products).where(where);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }

  /** Editions that can be sold: published editions of non-archived packages. */
  async sellableEditions() {
    return this.q.select({
      id: bookEditions.id, label: bookEditions.label, packageId: bookPackages.id, packageTitle: bookPackages.title, coverUrl: sql<string | null>`CASE WHEN ${bookPackages.coverVersion} IS NOT NULL THEN '/api/covers/' || ${bookPackages.id} || '?v=' || ${bookPackages.coverVersion} END`, coverColor: bookPackages.coverColor,
      gradeName: grades.name,
    }).from(bookEditions).innerJoin(bookPackages, eq(bookPackages.id, bookEditions.packageId)).innerJoin(grades, eq(grades.id, bookPackages.gradeId))
      .where(and(eq(bookEditions.status, 'PUBLISHED'), sql`${bookPackages.status} <> 'ARCHIVED'`))
      .orderBy(asc(grades.sort), asc(bookPackages.title), desc(bookEditions.editionYear));
  }

  private async validateItems(kind: 'SINGLE' | 'BUNDLE', editionIds: string[]) {
    const ids = [...new Set(editionIds)];
    if (kind === 'SINGLE' && ids.length !== 1) throw new BadRequestException('An individual book product contains exactly one book edition.');
    if (kind === 'BUNDLE' && ids.length < 2) throw new BadRequestException('A bundle must contain at least two book editions.');
    const eds = await this.q.select({ id: bookEditions.id, status: bookEditions.status, packageId: bookEditions.packageId })
      .from(bookEditions).where(inArray(bookEditions.id, ids));
    if (eds.length !== ids.length) throw new BadRequestException('One of the selected editions does not exist.');
    if (eds.some((e) => e.status !== 'PUBLISHED')) throw new BadRequestException('Only published editions can be sold.');
    if (new Set(eds.map((e) => e.packageId)).size !== eds.length) throw new BadRequestException('A bundle cannot contain two editions of the same book.');
    return ids;
  }

  /** The publisher's main currency (Company → Currency), used for new prices. */
  private async currency() {
    const { rows } = await this.q.execute(sql`SELECT coalesce(settings -> 'finance' ->> 'currency', 'AED') AS c FROM publishers WHERE id = ${this.pub}`);
    return (rows[0] as any)?.c ?? 'AED';
  }
  async createProduct(dto: CreateProductDto) {
    const ids = await this.validateItems(dto.kind, dto.editionIds);
    const [p] = await this.q.insert(products).values({
      publisherId: this.pub, sku: dto.sku.toUpperCase(), name: dto.name.trim(), kind: dto.kind, gradeId: dto.gradeId ?? null, description: dto.description ?? '',
    }).returning();
    const [v] = await this.q.insert(productVersions).values({ publisherId: this.pub, productId: p.id, versionNo: 1, priceMinor: dto.priceMinor ?? null, currency: dto.currency ?? (await this.currency()) }).returning();
    await this.q.insert(bundleItems).values(ids.map((editionId) => ({ productVersionId: v.id, editionId, publisherId: this.pub })));
    await this.audit.log('commerce.product.create', 'product', p.id, `Created ${p.kind === 'BUNDLE' ? 'bundle' : 'product'} ${p.sku} “${p.name}” (v1 draft)`, undefined, { ...p, editionIds: ids });
    return { ...p, draftVersionId: v.id };
  }

  async getProduct(id: string) {
    const [p] = await this.q.select().from(products).where(eq(products.id, id));
    if (!p) throw new NotFoundException('Product not found');
    const versions = await this.q.select().from(productVersions).where(eq(productVersions.productId, id)).orderBy(desc(productVersions.versionNo));
    const items = versions.length ? await this.q.select({
      versionId: bundleItems.productVersionId, editionId: bookEditions.id, editionLabel: bookEditions.label, editionStatus: bookEditions.status,
      packageId: bookPackages.id, packageTitle: bookPackages.title, coverUrl: sql<string | null>`CASE WHEN ${bookPackages.coverVersion} IS NOT NULL THEN '/api/covers/' || ${bookPackages.id} || '?v=' || ${bookPackages.coverVersion} END`, coverColor: bookPackages.coverColor,
    }).from(bundleItems).innerJoin(bookEditions, eq(bookEditions.id, bundleItems.editionId)).innerJoin(bookPackages, eq(bookPackages.id, bookEditions.packageId))
      .where(inArray(bundleItems.productVersionId, versions.map((v) => v.id))).orderBy(asc(bookPackages.title)) : [];
    const sold = versions.length ? await this.q.select({ versionId: orderLines.productVersionId, n: count() }).from(orderLines)
      .where(inArray(orderLines.productVersionId, versions.map((v) => v.id))).groupBy(orderLines.productVersionId) : [];
    return {
      ...p,
      versions: versions.map((v) => ({ ...v, items: items.filter((i) => i.versionId === v.id), orderLines: sold.find((s) => s.versionId === v.id)?.n ?? 0 })),
    };
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const [before] = await this.q.select().from(products).where(eq(products.id, id));
    if (!before) throw new NotFoundException('Product not found');
    const [row] = await this.q.update(products).set({ ...dto, updatedAt: new Date() }).where(eq(products.id, id)).returning();
    await this.audit.log('commerce.product.update', 'product', id, `Updated product ${row.sku}`, before, row);
    return row;
  }

  private async version(id: string) {
    const [v] = await this.q.select({ v: productVersions, kind: products.kind, sku: products.sku }).from(productVersions)
      .innerJoin(products, eq(products.id, productVersions.productId)).where(eq(productVersions.id, id));
    if (!v) throw new NotFoundException('Product version not found');
    return v;
  }

  async newVersion(productId: string, copyFromVersionId?: string) {
    const p = await this.getProduct(productId);
    if (p.versions.some((v) => v.status === 'DRAFT')) throw new ConflictException('This product already has a draft version. Edit or activate it first.');
    const src = copyFromVersionId ? p.versions.find((v) => v.id === copyFromVersionId) : p.versions.find((v) => v.status === 'ACTIVE') ?? p.versions[0];
    const [v] = await this.q.insert(productVersions).values({
      publisherId: this.pub, productId, versionNo: (p.versions[0]?.versionNo ?? 0) + 1, priceMinor: src?.priceMinor ?? null, currency: await this.currency(),
    }).returning();
    // Only still-published editions are carried over.
    const items = (src?.items ?? []).filter((i) => i.editionStatus === 'PUBLISHED');
    if (items.length) await this.q.insert(bundleItems).values(items.map((i) => ({ productVersionId: v.id, editionId: i.editionId, publisherId: this.pub })));
    await this.audit.log('commerce.version.create', 'product', productId, `Created draft v${v.versionNo} of ${p.sku}`);
    return v;
  }

  async updateVersion(id: string, dto: UpdateVersionDto) {
    const { v, kind, sku } = await this.version(id);
    if (v.status !== 'DRAFT') throw new ConflictException(`v${v.versionNo} is ${v.status.toLowerCase()} — it is frozen. Create a new version to change books or price.`);
    if (dto.editionIds) {
      const ids = await this.validateItems(kind, dto.editionIds);
      await this.q.delete(bundleItems).where(eq(bundleItems.productVersionId, id));
      await this.q.insert(bundleItems).values(ids.map((editionId) => ({ productVersionId: id, editionId, publisherId: this.pub })));
    }
    const patch: Record<string, unknown> = {};
    if (dto.priceMinor !== undefined) patch.priceMinor = dto.priceMinor;
    if (dto.currency) patch.currency = dto.currency;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (Object.keys(patch).length) await this.q.update(productVersions).set(patch).where(eq(productVersions.id, id));
    await this.audit.log('commerce.version.update', 'product', v.productId, `Edited draft v${v.versionNo} of ${sku}`, undefined, dto);
    return { ok: true };
  }

  async activateVersion(id: string) {
    const { v, kind, sku } = await this.version(id);
    if (v.status !== 'DRAFT') throw new ConflictException('Only a draft version can be activated.');
    const items = await this.q.select({ editionId: bundleItems.editionId }).from(bundleItems).where(eq(bundleItems.productVersionId, id));
    await this.validateItems(kind, items.map((i) => i.editionId));
    // The previous active version is retired: still valid for every licence already sold, but no longer offered for new orders.
    await this.q.update(productVersions).set({ status: 'RETIRED' }).where(and(eq(productVersions.productId, v.productId), eq(productVersions.status, 'ACTIVE')));
    const [row] = await this.q.update(productVersions).set({ status: 'ACTIVE', activatedAt: new Date() }).where(eq(productVersions.id, id)).returning();
    await this.audit.log('commerce.version.activate', 'product', v.productId, `Activated v${v.versionNo} of ${sku} — contents & price are now frozen`);
    return row;
  }

  async retireVersion(id: string) {
    const { v, sku } = await this.version(id);
    if (v.status !== 'ACTIVE') throw new ConflictException('Only the active version can be retired.');
    await this.q.update(productVersions).set({ status: 'RETIRED' }).where(eq(productVersions.id, id));
    await this.audit.log('commerce.version.retire', 'product', v.productId, `Retired v${v.versionNo} of ${sku} (existing licences unaffected)`);
    return { ok: true };
  }

  async deleteVersion(id: string) {
    const { v, sku } = await this.version(id);
    if (v.status !== 'DRAFT') throw new ConflictException('Only draft versions can be deleted.');
    await this.q.delete(productVersions).where(eq(productVersions.id, id));
    await this.audit.log('commerce.version.delete', 'product', v.productId, `Deleted draft v${v.versionNo} of ${sku}`);
    return { ok: true };
  }

  // ======================= orders =======================
  async listOrders(f: OrderQuery) {
    const w: SQL[] = [];
    if (f.schoolId) w.push(eq(orders.schoolId, f.schoolId));
    if (f.status) w.push(eq(orders.status, f.status as any));
    const where = w.length ? and(...w) : undefined;
    const items = await this.q.select({
      id: orders.id, orderNo: orders.orderNo, type: orders.type, status: orders.status, createdAt: orders.createdAt, fulfilledAt: orders.fulfilledAt,
      school: { id: schools.id, name: schools.name, code: schools.code }, academicYear: academicYears.name,
      students: sql<number>`(SELECT coalesce(sum(student_qty),0)::int FROM order_lines l WHERE l.order_id = ${qc(orders.id)})`,
      teachers: sql<number>`(SELECT coalesce(sum(teacher_qty),0)::int FROM order_lines l WHERE l.order_id = ${qc(orders.id)})`,
      totalMinor: sql<number>`(SELECT coalesce(sum(l.student_qty * coalesce(l.unit_price_minor,0)),0)::bigint FROM order_lines l WHERE l.order_id = ${qc(orders.id)})`,
    }).from(orders).innerJoin(schools, eq(schools.id, orders.schoolId)).innerJoin(academicYears, eq(academicYears.id, orders.academicYearId))
      .where(where).orderBy(desc(orders.createdAt)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const [{ n }] = await this.q.select({ n: count() }).from(orders).where(where);
    return { items: items.map((i) => ({ ...i, totalMinor: Number(i.totalMinor) })), total: n, page: f.page, pageSize: f.pageSize };
  }

  private async checkLines(lines: OrderLineDto[]) {
    const ids = [...new Set(lines.map((l) => l.productVersionId))];
    if (ids.length !== lines.length) throw new BadRequestException('Each product can appear only once per order.');
    const vs = await this.q.select({ id: productVersions.id, status: productVersions.status, price: productVersions.priceMinor }).from(productVersions).where(inArray(productVersions.id, ids));
    if (vs.length !== ids.length) throw new BadRequestException('Unknown product version.');
    if (vs.some((v) => v.status !== 'ACTIVE')) throw new BadRequestException('Orders can only use the active version of a product.');
    for (const l of lines) if (l.studentQty + l.teacherQty <= 0) throw new BadRequestException('Each line needs at least one student or teacher seat.');
    return lines.map((l) => ({ ...l, unitPriceMinor: l.unitPriceMinor ?? vs.find((v) => v.id === l.productVersionId)!.price }));
  }

  async createOrder(dto: CreateOrderDto) {
    const [school] = await this.q.select().from(schools).where(eq(schools.id, dto.schoolId));
    if (!school) throw new NotFoundException('School not found');
    const [ay] = await this.q.select().from(academicYears).where(and(eq(academicYears.id, dto.academicYearId), eq(academicYears.schoolId, school.id)));
    if (!ay) throw new BadRequestException('Academic year does not belong to this school');
    const lines = await this.checkLines(dto.lines);
    const { rows } = await this.q.execute(sql`SELECT nextval('order_no_seq') AS n`);
    const orderNo = `ORD-${new Date().getFullYear()}-${String((rows[0] as any).n).padStart(5, '0')}`;
    const [o] = await this.q.insert(orders).values({
      publisherId: this.pub, schoolId: school.id, academicYearId: ay.id, orderNo, type: dto.type, notes: dto.notes ?? '', createdBy: this.db.ctx.userId,
    }).returning();
    await this.q.insert(orderLines).values(lines.map((l) => ({ ...l, publisherId: this.pub, schoolId: school.id, orderId: o.id })));
    await this.audit.log('commerce.order.create', 'order', o.id, `Created ${dto.type.toLowerCase()} order ${orderNo} for ${school.name}`, undefined, { ...o, lines }, school.id);
    return o;
  }

  private async order(id: string) {
    const [o] = await this.q.select().from(orders).where(eq(orders.id, id));
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  async getOrder(id: string) {
    const o = await this.order(id);
    const [school] = await this.q.select({ id: schools.id, name: schools.name, code: schools.code }).from(schools).where(eq(schools.id, o.schoolId));
    const [ay] = await this.q.select().from(academicYears).where(eq(academicYears.id, o.academicYearId));
    const lines = await this.q.select({
      id: orderLines.id, studentQty: orderLines.studentQty, teacherQty: orderLines.teacherQty, unitPriceMinor: orderLines.unitPriceMinor,
      productVersionId: orderLines.productVersionId, versionNo: productVersions.versionNo, currency: productVersions.currency,
      productName: products.name, sku: products.sku, kind: products.kind,
      books: sql<string[]>`(SELECT array_agg(bp.title ORDER BY bp.title) FROM bundle_items b JOIN book_editions e ON e.id = b.edition_id
        JOIN book_packages bp ON bp.id = e.package_id WHERE b.product_version_id = ${qc(orderLines.productVersionId)})`,
    }).from(orderLines).innerJoin(productVersions, eq(productVersions.id, orderLines.productVersionId)).innerJoin(products, eq(products.id, productVersions.productId))
      .where(eq(orderLines.orderId, id));
    const pools = lines.length ? await this.q.select({ id: licensePools.id, seatType: licensePools.seatType, quantity: licensePools.quantity, status: licensePools.status,
      validUntil: licensePools.validUntil, orderLineId: fulfillments.orderLineId })
      .from(licensePools).innerJoin(fulfillments, eq(fulfillments.id, licensePools.fulfillmentId)).where(inArray(fulfillments.orderLineId, lines.map((l) => l.id))) : [];
    return { ...o, school, academicYear: ay, lines: lines.map((l) => ({ ...l, pools: pools.filter((p) => p.orderLineId === l.id) })) };
  }

  async updateOrder(id: string, dto: UpdateOrderDto) {
    const o = await this.order(id);
    if (o.status !== 'DRAFT') throw new ConflictException('Only draft orders can be edited.');
    if (dto.lines) {
      const lines = await this.checkLines(dto.lines);
      await this.q.delete(orderLines).where(eq(orderLines.orderId, id));
      await this.q.insert(orderLines).values(lines.map((l) => ({ ...l, publisherId: this.pub, schoolId: o.schoolId, orderId: id })));
    }
    if (dto.notes !== undefined) await this.q.update(orders).set({ notes: dto.notes }).where(eq(orders.id, id));
    await this.audit.log('commerce.order.update', 'order', id, `Edited draft order ${o.orderNo}`, undefined, dto, o.schoolId);
    return { ok: true };
  }

  async confirmOrder(id: string) {
    const o = await this.order(id);
    if (o.status !== 'DRAFT') throw new ConflictException(`Order is ${o.status.toLowerCase()}.`);
    await this.q.update(orders).set({ status: 'CONFIRMED', confirmedAt: new Date() }).where(eq(orders.id, id));
    await this.audit.log('commerce.order.confirm', 'order', id, `Confirmed order ${o.orderNo}`, undefined, undefined, o.schoolId);
    return { ok: true };
  }

  async cancelOrder(id: string) {
    const o = await this.order(id);
    if (!['DRAFT', 'CONFIRMED'].includes(o.status)) throw new ConflictException('Fulfilled orders cannot be cancelled — licences were already issued. Use an adjustment or revoke seats.');
    await this.q.update(orders).set({ status: 'CANCELLED', cancelledAt: new Date() }).where(eq(orders.id, id));
    await this.audit.log('commerce.order.cancel', 'order', id, `Cancelled order ${o.orderNo}`, undefined, undefined, o.schoolId);
    return { ok: true };
  }

  /** Issue licences: one fulfilment per line, a student pool and/or a teacher pool, with every seat materialised. */
  async fulfilOrder(id: string) {
    const o = await this.order(id);
    if (o.status !== 'CONFIRMED') throw new ConflictException(o.status === 'FULFILLED' ? 'Licences were already issued for this order.' : 'Confirm the order before issuing licences.');
    const [ay] = await this.q.select().from(academicYears).where(eq(academicYears.id, o.academicYearId));
    if (ay.endsOn <= new Date()) throw new BadRequestException(`The academic year “${ay.name}” has already ended.`);
    const [school] = await this.q.select().from(schools).where(eq(schools.id, o.schoolId));
    if (school.status !== 'ACTIVE') throw new ConflictException('The school is suspended.');
    const lines = await this.q.select().from(orderLines).where(eq(orderLines.orderId, id));
    let seatsIssued = 0;
    for (const l of lines) {
      const [f] = await this.q.insert(fulfillments).values({ publisherId: this.pub, schoolId: o.schoolId, orderLineId: l.id, fulfilledBy: this.db.ctx.userId }).returning();
      for (const [seatType, qty] of [['STUDENT', l.studentQty], ['TEACHER', l.teacherQty]] as const) {
        if (!qty) continue;
        const [pool] = await this.q.insert(licensePools).values({
          publisherId: this.pub, schoolId: o.schoolId, academicYearId: ay.id, productVersionId: l.productVersionId, seatType, quantity: qty,
          fulfillmentId: f.id, validFrom: ay.startsOn, validUntil: ay.endsOn,
        }).returning();
        await this.createSeats(pool.id, o.schoolId, qty);
        seatsIssued += qty;
      }
    }
    await this.q.update(orders).set({ status: 'FULFILLED', fulfilledAt: new Date() }).where(eq(orders.id, id));
    await this.audit.log('licensing.order.fulfil', 'order', id, `Issued ${seatsIssued} seats for order ${o.orderNo} (valid until ${ay.endsOn.toISOString().slice(0, 10)})`, undefined, undefined, o.schoolId);
    return { ok: true, seatsIssued };
  }

  async createSeats(poolId: string, schoolId: string, qty: number) {
    await this.q.execute(sql`INSERT INTO ${licenseSeats} (publisher_id, school_id, pool_id, seat_no)
      SELECT ${this.pub}, ${schoolId}, ${poolId}, g FROM generate_series(1, ${qty}) g`);
  }

  async maxVersionNo(productId: string) {
    const [{ m }] = await this.q.select({ m: max(productVersions.versionNo) }).from(productVersions).where(eq(productVersions.productId, productId));
    return m ?? 0;
  }
}
