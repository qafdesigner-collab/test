import { BadRequestException, OnModuleInit, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';
import { ManualTx, Public, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { StorageModule } from '../storage/storage.module';
import { setRegion } from '../common/region';
import { PROTECTION_DEFAULTS, protectionFor } from '../common/protection';

const URL_RE = /^https:\/\/[^\s]+$/;
const opt = (s?: string | null) => (s ?? '').trim();

class CompanyDto {
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(160) tradeName?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) whatsapp?: string;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @ValidateIf((o) => !!o.website) @Matches(URL_RE, { message: 'Website must start with https://' }) @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(60) registrationNo?: string;
  @IsOptional() @IsString() @MaxLength(4000) about?: string;
  @IsOptional() @ValidateIf((o) => !!o.facebook) @Matches(URL_RE, { message: 'Links must start with https://' }) @MaxLength(200) facebook?: string;
  @IsOptional() @ValidateIf((o) => !!o.instagram) @Matches(URL_RE, { message: 'Links must start with https://' }) @MaxLength(200) instagram?: string;
  @IsOptional() @ValidateIf((o) => !!o.linkedin) @Matches(URL_RE, { message: 'Links must start with https://' }) @MaxLength(200) linkedin?: string;
  @IsOptional() @ValidateIf((o) => !!o.youtube) @Matches(URL_RE, { message: 'Links must start with https://' }) @MaxLength(200) youtube?: string;
  @IsOptional() @IsBoolean() showOnLogin?: boolean;
}
class FinanceDto {
  @Matches(/^[A-Z]{3}$/, { message: 'Use a 3-letter currency code such as AED' }) currency!: string;
  @IsOptional() @ValidateIf((o) => !!o.secondaryCurrency) @Matches(/^[A-Z]{3}$/, { message: 'Use a 3-letter currency code such as USD' }) secondaryCurrency?: string | null;
  /** How many units of the second currency one unit of the main currency is worth (AED → USD: 0.2723). */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000) rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vatRate?: number;
  @IsOptional() @IsString() @MaxLength(20) taxLabel?: string;
  @IsOptional() @IsString() @MaxLength(40) taxNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3) decimals?: number;
  @IsOptional() @IsString() @MaxLength(1000) paymentDetails?: string;
}
class RegionDto {
  @Matches(/^\d{1,4}$/, { message: 'Country calling code, digits only (e.g. 971)' }) phoneCode!: string;
  @IsString() @MaxLength(60) timezone!: string;
}
class ProtectionDto { @IsBoolean() enabled!: boolean; @IsBoolean() teachers!: boolean; }
class DocDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsIn(['PROFILE', 'BROCHURE', 'CATALOGUE', 'PRICE_LIST', 'CERTIFICATE', 'OTHER']) category?: string;
  @IsOptional() @IsIn(['PUBLIC', 'SCHOOLS', 'STAFF']) visibility?: string;
  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
}

export const FINANCE_DEFAULTS = { currency: 'AED', secondaryCurrency: 'USD', rate: 0.27229408, vatRate: 5, taxLabel: 'VAT', taxNumber: '', decimals: 2, paymentDetails: '' };
export const REGION_DEFAULTS = { phoneCode: '971', timezone: 'Asia/Dubai' };
const DOC_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp'];
const INLINE = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

@Injectable()
export class CompanyService implements OnModuleInit {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService) {}
  async onModuleInit() { try { setRegion((await this.publicInfo()).region); } catch { /* database not ready yet: defaults apply */ } }
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.db.q.execute(s)).rows as any[]; }

  /** For the sign-in page and printouts: company card, money and region settings, public documents. */
  async publicInfo() {
    const r = ((await this.db.root.execute(sql`SELECT * FROM public_company(${process.env.BRANDING_PUBLISHER_SLUG ?? ''})`)).rows[0] ?? {}) as any;
    const c = r.company ?? {};
    return { name: c.tradeName || r.name || null, company: c, finance: { ...FINANCE_DEFAULTS, ...(r.finance ?? {}) }, region: { ...REGION_DEFAULTS, ...(r.region ?? {}) }, documents: r.documents ?? [] };
  }

  async settings() {
    const [p] = await this.rows(sql`SELECT name, coalesce(settings -> 'company', '{}') AS company, coalesce(settings -> 'finance', '{}') AS finance, coalesce(settings -> 'region', '{}') AS region
      FROM publishers WHERE id = ${this.ctx.publisherId}`);
    return { name: p.name, company: p.company, finance: { ...FINANCE_DEFAULTS, ...p.finance }, region: { ...REGION_DEFAULTS, ...p.region } };
  }

  private async put(key: 'company' | 'finance' | 'region', value: any, summary: string) {
    const before = (await this.settings())[key];
    await this.db.q.execute(sql`SELECT set_publisher_setting(${key}, ${JSON.stringify(value)}::jsonb)`);
    await this.audit.log(`company.${key}.update`, 'publisher', this.ctx.publisherId, summary, before, value);
    return this.settings();
  }
  async protectionSettings() {
    const { rows } = await this.db.q.execute(sql`SELECT coalesce(settings -> 'protection', '{}') AS p FROM publishers WHERE id = ${this.ctx.publisherId}`);
    return { ...PROTECTION_DEFAULTS, ...((rows[0] as any)?.p ?? {}) };
  }
  async saveProtection(d: ProtectionDto) {
    const before = await this.protectionSettings();
    await this.db.q.execute(sql`SELECT set_publisher_setting('protection', ${JSON.stringify(d)}::jsonb)`);
    await this.audit.log('company.protection.update', 'publisher', this.ctx.publisherId, `Content protection ${d.enabled ? `on${d.teachers ? ' (also for teachers)' : ' (pupils and parents)'}` : 'off'}`, before, d);
    return this.protectionSettings();
  }
  saveCompany(d: CompanyDto) {
    const clean = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? opt(v) : v]));
    return this.put('company', clean, 'Updated the company profile');
  }
  saveFinance(d: FinanceDto) {
    if (d.secondaryCurrency && d.secondaryCurrency === d.currency) throw new BadRequestException('The second currency must be different from the main currency');
    if (d.secondaryCurrency && !(d.rate! > 0)) throw new BadRequestException('Enter the exchange rate for the second currency');
    return this.put('finance', { ...FINANCE_DEFAULTS, ...d, secondaryCurrency: d.secondaryCurrency || null }, `Currency set to ${d.currency}${d.secondaryCurrency ? ` (also shown in ${d.secondaryCurrency})` : ''}`);
  }
  async saveRegion(d: RegionDto) {
    try { new Intl.DateTimeFormat('en', { timeZone: d.timezone }); } catch { throw new BadRequestException('Unknown time zone'); }
    const r = await this.put('region', d, `Region set: +${d.phoneCode}, ${d.timezone}`);
    setRegion(d);
    return r;
  }

  // ---------------------------------------------------------------- documents
  listDocuments() {
    return this.rows(sql`SELECT d.id, d.title, d.description, d.category, d.visibility, d.sort, d.created_at AS "createdAt", a.ext, a.size_bytes AS size, a.original_name AS "fileName"
      FROM company_documents d JOIN digital_assets a ON a.id = d.asset_id ORDER BY d.sort, d.created_at`);
  }
  async addDocument(file: Express.Multer.File, d: DocDto) {
    if (!file) throw new BadRequestException('Choose a file');
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!DOC_TYPES.includes(ext)) throw new BadRequestException('Upload a PDF, Word, Excel, PowerPoint or image file');
    const { asset } = await this.assets.ingest(file as any);
    const title = opt(d.title) || file.originalname.replace(/\.[^.]+$/, '').slice(0, 160);
    const [row] = await this.rows(sql`INSERT INTO company_documents (publisher_id, asset_id, title, description, category, visibility, sort, created_by)
      VALUES (${this.ctx.publisherId}, ${asset.id}, ${title}, ${opt(d.description)}, ${d.category ?? 'OTHER'}, ${d.visibility ?? 'SCHOOLS'}, ${d.sort ?? 0}, ${this.ctx.userId}) RETURNING id`);
    await this.audit.log('company.document.add', 'company_document', row.id, `Uploaded company document ${title}`);
    return row;
  }
  async updateDocument(id: string, d: DocDto) {
    const [r] = await this.rows(sql`UPDATE company_documents SET title = coalesce(${d.title ? opt(d.title) : null}, title), description = coalesce(${d.description ?? null}, description),
      category = coalesce(${d.category ?? null}, category), visibility = coalesce(${d.visibility ?? null}, visibility), sort = coalesce(${d.sort ?? null}::int, sort) WHERE id = ${id} RETURNING id`);
    if (!r) throw new NotFoundException('Document not found');
    return { ok: true };
  }
  async removeDocument(id: string) {
    const [r] = await this.rows(sql`DELETE FROM company_documents WHERE id = ${id} RETURNING title`);
    if (!r) throw new NotFoundException('Document not found');
    await this.audit.log('company.document.remove', 'company_document', id, `Removed company document ${r.title}`);
    return { ok: true };
  }
  /** Signed-in users: anything they may see (RLS hides staff-only documents from schools). */
  async documentFile(id: string) {
    const [d] = await this.rows(sql`SELECT a.storage_key AS key, a.mime_type AS mime, a.ext, d.title FROM company_documents d JOIN digital_assets a ON a.id = d.asset_id WHERE d.id = ${id}`);
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }
  async publicDocumentFile(id: string) {
    const [d] = (await this.db.root.execute(sql`SELECT storage_key AS key, mime_type AS mime, ext, title FROM public_company_document(${id})`)).rows as any[];
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }
  async stream(d: { key: string; mime: string; ext: string; title: string }, res: Response) {
    const safe = d.title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 100) || 'document';
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Content-Disposition', `${INLINE.includes(d.ext) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(`${safe}.${d.ext}`)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    (await this.assets.driver.read(d.key)).on('error', () => res.destroy()).pipe(res);
  }
}

const A = 'PUBLISHER_ADMIN';
@ApiTags('company')
@Controller('company')
export class CompanyController {
  constructor(private readonly svc: CompanyService, private readonly db: DbService) {}
  @Public() @SkipThrottle() @ManualTx() @Get() info() { return this.svc.publicInfo(); }
  @Public() @ManualTx() @Get('public-documents/:id') async publicDoc(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) { await this.svc.stream(await this.svc.publicDocumentFile(id), res); }
  @Roles(A, 'PUBLISHER_EDITOR', 'PUBLISHER_SALES') @Get('settings') settings() { return this.svc.settings(); }
  @Roles(A) @Put('profile') company(@Body() d: CompanyDto) { return this.svc.saveCompany(d); }
  @Roles(A) @Put('finance') finance(@Body() d: FinanceDto) { return this.svc.saveFinance(d); }
  @Roles(A) @Put('region') region(@Body() d: RegionDto) { return this.svc.saveRegion(d); }
  @Get('documents') docs() { return this.svc.listDocuments(); }
  /** For the viewers: does this user see book content in protected mode, and with which watermark? */
  @Get('my-protection') myProtection() { return protectionFor(this.db); }
  @Roles(A) @Get('protection') protection() { return this.svc.protectionSettings(); }
  @Roles(A) @Put('protection') saveProtection(@Body() d: ProtectionDto) { return this.svc.saveProtection(d); }
  @Get('documents/:id/file') async doc(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) { await this.svc.stream(await this.svc.documentFile(id), res); }
  @Roles(A) @ManualTx() @Post('documents')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: appTmp('uploads'), filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }), limits: { fileSize: 50 * 1048576, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() d: DocDto, @Req() req: any) { return this.db.withContext(req.ctx, () => this.svc.addDocument(file, d)); }
  @Roles(A) @Patch('documents/:id') update(@Param('id', new ParseUUIDPipe()) id: string, @Body() d: DocDto) { return this.svc.updateDocument(id, d); }
  @Roles(A) @Delete('documents/:id') remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.removeDocument(id); }
}

@Module({ imports: [StorageModule], controllers: [CompanyController], providers: [CompanyService], exports: [CompanyService] })
export class CompanyModule {}
