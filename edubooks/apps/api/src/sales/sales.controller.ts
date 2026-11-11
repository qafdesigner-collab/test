import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown) => Number(v ?? 0);

/**
 * Sales overview for publisher staff. Revenue counts confirmed and fulfilled orders by confirmation date:
 * student quantity × unit price (the line price, or the product version price when the line has none).
 * Seat figures use licences that are live today.
 */
@Injectable()
export class SalesService {
  constructor(private readonly db: DbService) {}
  private get q() { return this.db.q; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.q.execute(s)).rows as any[]; }

  async dashboard(from?: string, to?: string) {
    if ((from && !DAY.test(from)) || (to && !DAY.test(to))) throw new BadRequestException('Dates must look like 2026-01-31');
    const end = to ?? new Date().toISOString().slice(0, 10);
    const start = from ?? new Date(new Date(end).getTime() - 364 * 864e5).toISOString().slice(0, 10).replace(/\d\d$/, '01');
    if (start > end) throw new BadRequestException('The start date is after the end date');

    const sales = sql`(SELECT o.id AS order_id, o.school_id, o.confirmed_at, pv.product_id, pv.currency, l.student_qty, l.teacher_qty,
        l.student_qty * coalesce(l.unit_price_minor, pv.price_minor, 0) AS amount
      FROM orders o JOIN order_lines l ON l.order_id = o.id JOIN product_versions pv ON pv.id = l.product_version_id
      WHERE o.status IN ('CONFIRMED', 'FULFILLED') AND o.confirmed_at BETWEEN ${start}::date AND ${end}::date)`;
    const live = sql`(SELECT p.id, p.school_id, pv.product_id, p.seat_type, p.valid_until,
        (SELECT count(*) FROM license_seats s WHERE s.pool_id = p.id AND s.status <> 'REVOKED')::int AS seats,
        (SELECT count(*) FROM license_assignments a WHERE a.pool_id = p.id AND a.status = 'ACTIVE')::int AS assigned
      FROM license_pools p JOIN product_versions pv ON pv.id = p.product_version_id
      WHERE p.status = 'ACTIVE' AND p.valid_until >= current_date)`;

    const [k] = await this.rows(sql`SELECT coalesce(sum(amount), 0)::bigint AS revenue, count(DISTINCT order_id)::int AS orders, count(DISTINCT school_id)::int AS schools,
      coalesce(sum(student_qty + teacher_qty), 0)::int AS seats, mode() WITHIN GROUP (ORDER BY currency) AS currency FROM ${sales} x`);
    const [u] = await this.rows(sql`SELECT coalesce(sum(seats), 0)::int AS seats, coalesce(sum(assigned), 0)::int AS assigned, count(DISTINCT school_id)::int AS schools FROM ${live} x WHERE seat_type = 'STUDENT'`);
    const [sc] = await this.rows(sql`SELECT count(*) FILTER (WHERE NOT is_demo AND status = 'ACTIVE')::int AS active, count(*) FILTER (WHERE is_demo AND status = 'ACTIVE')::int AS demos FROM schools`);

    const monthly = await this.rows(sql`SELECT to_char(m, 'YYYY-MM') AS month, coalesce(sum(x.amount), 0)::bigint AS revenue, count(DISTINCT x.order_id)::int AS orders
      FROM generate_series(date_trunc('month', ${start}::date), date_trunc('month', ${end}::date), interval '1 month') m
      LEFT JOIN ${sales} x ON date_trunc('month', x.confirmed_at) = m GROUP BY m ORDER BY m`);

    const byCity = await this.rows(sql`WITH r AS (SELECT school_id, sum(amount) AS amount FROM ${sales} x GROUP BY school_id),
        lv AS (SELECT school_id, sum(seats) AS seats, sum(assigned) AS assigned FROM ${live} x WHERE seat_type = 'STUDENT' GROUP BY school_id)
      SELECT coalesce(nullif(trim(s.city), ''), 'Not set') AS city, count(*)::int AS schools, count(*) FILTER (WHERE lv.seats > 0)::int AS licensed,
        coalesce(sum(r.amount), 0)::bigint AS revenue, coalesce(sum(lv.seats), 0)::int AS seats, coalesce(sum(lv.assigned), 0)::int AS assigned
      FROM schools s LEFT JOIN r ON r.school_id = s.id LEFT JOIN lv ON lv.school_id = s.id WHERE NOT s.is_demo
      GROUP BY 1 ORDER BY revenue DESC, schools DESC`);

    const byProduct = await this.rows(sql`SELECT pr.name AS product, pr.sku, pr.kind, coalesce(sum(x.amount), 0)::bigint AS revenue,
        coalesce(sum(x.student_qty), 0)::int AS "studentSeats", coalesce(sum(x.teacher_qty), 0)::int AS "teacherSeats", count(DISTINCT x.school_id)::int AS schools
      FROM ${sales} x JOIN products pr ON pr.id = x.product_id GROUP BY pr.id ORDER BY revenue DESC, "studentSeats" DESC`);

    const topSchools = await this.rows(sql`WITH r AS (SELECT school_id, sum(amount) AS amount, count(DISTINCT order_id) AS orders FROM ${sales} x GROUP BY school_id),
        lv AS (SELECT school_id, sum(seats) AS seats, sum(assigned) AS assigned FROM ${live} x WHERE seat_type = 'STUDENT' GROUP BY school_id)
      SELECT s.id, s.name, s.code, s.city, coalesce(r.amount, 0)::bigint AS revenue, coalesce(r.orders, 0)::int AS orders,
        coalesce(lv.seats, 0)::int AS seats, coalesce(lv.assigned, 0)::int AS assigned
      FROM schools s LEFT JOIN r ON r.school_id = s.id LEFT JOIN lv ON lv.school_id = s.id
      WHERE NOT s.is_demo AND (r.amount > 0 OR lv.seats > 0) ORDER BY revenue DESC, seats DESC LIMIT 15`);

    const expiring = await this.rows(sql`SELECT s.id AS "schoolId", s.name AS school, s.city, pr.name AS product, min(x.valid_until) AS "validUntil",
        (min(x.valid_until)::date - current_date)::int AS "daysLeft", sum(x.seats)::int AS seats, sum(x.assigned)::int AS assigned
      FROM ${live} x JOIN schools s ON s.id = x.school_id JOIN products pr ON pr.id = x.product_id
      WHERE x.valid_until::date < current_date + 60 GROUP BY s.id, pr.id ORDER BY "validUntil", school LIMIT 50`);

    const notRenewed = await this.rows(sql`SELECT s.id AS "schoolId", s.name AS school, s.city, pr.name AS product, max(p.valid_until) AS "expiredOn",
        sum(p.quantity)::int AS seats
      FROM license_pools p JOIN product_versions pv ON pv.id = p.product_version_id JOIN products pr ON pr.id = pv.product_id JOIN schools s ON s.id = p.school_id
      WHERE p.valid_until < current_date AND p.valid_until >= current_date - 180 AND p.status <> 'REVOKED'
        AND NOT EXISTS (SELECT 1 FROM ${live} x WHERE x.school_id = p.school_id AND x.product_id = pv.product_id)
      GROUP BY s.id, pr.id ORDER BY "expiredOn" DESC LIMIT 50`);

    const lowUsage = await this.rows(sql`SELECT s.id AS "schoolId", s.name AS school, s.city, sum(x.seats)::int AS seats, sum(x.assigned)::int AS assigned,
        min(x.valid_until) AS "validUntil"
      FROM ${live} x JOIN schools s ON s.id = x.school_id WHERE x.seat_type = 'STUDENT'
      GROUP BY s.id HAVING sum(x.seats) >= 10 AND sum(x.assigned) < 0.3 * sum(x.seats) ORDER BY sum(x.assigned)::float / sum(x.seats) LIMIT 30`);

    const demos = await this.rows(sql`SELECT s.id, s.name, s.code, s.city, s.demo_expires_at AS "expiresAt",
        CASE WHEN s.demo_expires_at IS NULL THEN NULL ELSE ceil(extract(epoch FROM s.demo_expires_at - now()) / 86400)::int END AS "daysLeft",
        (SELECT count(*) FROM users u WHERE u.school_id = s.id AND u.last_login_at IS NOT NULL)::int AS "usersSignedIn"
      FROM schools s WHERE s.is_demo AND s.status = 'ACTIVE' ORDER BY s.demo_expires_at NULLS LAST LIMIT 50`);

    const money = (r: any) => ({ ...r, revenue: n(r.revenue) });
    return {
      range: { from: start, to: end }, currency: k.currency ?? 'PKR',
      kpis: { revenue: n(k.revenue), orders: k.orders, orderingSchools: k.schools, seatsSold: k.seats, activeSchools: sc.active, demoSchools: sc.demos,
        liveSeats: u.seats, assignedSeats: u.assigned, licensedSchools: u.schools, usage: u.seats ? Math.round((u.assigned / u.seats) * 100) : null },
      monthly: monthly.map(money), byCity: byCity.map(money), byProduct: byProduct.map(money), topSchools: topSchools.map(money),
      expiring, notRenewed, lowUsage, demos,
    };
  }
}

@ApiTags('sales')
@Controller('sales')
export class SalesController {
  constructor(private readonly svc: SalesService) {}
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_SALES') @Get('dashboard') dashboard(@Query('from') from?: string, @Query('to') to?: string) { return this.svc.dashboard(from, to); }
}

@Module({ controllers: [SalesController], providers: [SalesService] })
export class SalesModule {}
