import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { ManualTx, PUBLISHER_STAFF, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { PublishingService } from './publishing.service';
import { IndexerService } from '../ai/indexer.service';
import {
  CreateComponentDto, CreateEditionDto, CreateLessonDto, CreatePackageDto, CreateUnitDto, PackageQuery, ReorderDto, UpdateUnitDto,
  UpdateComponentDto, UpdateEditionDto, UpdateLessonDto, UpdatePackageDto, UpdateResourceDto, UploadResourcesDto,
} from './publishing.dto';

const TMP = appTmp('uploads');
const uploadOpts = {
  storage: diskStorage({ destination: TMP, filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20 },
};
const Id = () => new ParseUUIDPipe();

@ApiTags('publishing')
@Roles(...PUBLISHER_STAFF)
@Controller('publishing')
export class PublishingController {
  constructor(private readonly svc: PublishingService, private readonly db: DbService, private readonly indexer: IndexerService) {}

  @Get('stats') stats() { return this.svc.stats(); }

  // packages
  @Get('packages') list(@Query() q: PackageQuery) { return this.svc.listPackages(q); }
  @Post('packages') create(@Body() d: CreatePackageDto) { return this.svc.createPackage(d); }
  @Get('packages/:id') get(@Param('id', Id()) id: string) { return this.svc.getPackage(id); }
  @Patch('packages/:id') update(@Param('id', Id()) id: string, @Body() d: UpdatePackageDto) { return this.svc.updatePackage(id, d); }
  @Post('packages/:id/archive') archive(@Param('id', Id()) id: string) { return this.svc.setPackageArchived(id, true); }
  @Post('packages/:id/restore') restore(@Param('id', Id()) id: string) { return this.svc.setPackageArchived(id, false); }

  // editions
  @Get('packages/:id/editions') editions(@Param('id', Id()) id: string) { return this.svc.listEditions(id); }
  @Post('packages/:id/editions') addEdition(@Param('id', Id()) id: string, @Body() d: CreateEditionDto) { return this.svc.createEdition(id, d); }
  @Get('editions/:id') edition(@Param('id', Id()) id: string) { return this.svc.getEditionTree(id); }
  @Patch('editions/:id') updEdition(@Param('id', Id()) id: string, @Body() d: UpdateEditionDto) { return this.svc.updateEdition(id, d); }
  @Post('editions/:id/publish') publish(@Param('id', Id()) id: string) { return this.svc.publishEdition(id); }
  @Post('editions/:id/archive') archiveEd(@Param('id', Id()) id: string) { return this.svc.archiveEdition(id); }
  @Delete('editions/:id') delEdition(@Param('id', Id()) id: string) { return this.svc.deleteEdition(id); }

  // structure
  @Post('editions/:id/components') addComp(@Param('id', Id()) id: string, @Body() d: CreateComponentDto) { return this.svc.addComponent(id, d); }
  @Patch('components/:id') updComp(@Param('id', Id()) id: string, @Body() d: UpdateComponentDto) { return this.svc.updateComponent(id, d); }
  @Delete('components/:id') delComp(@Param('id', Id()) id: string) { return this.svc.deleteComponent(id); }
  @Post('components/:id/units') addUnit(@Param('id', Id()) id: string, @Body() d: CreateUnitDto) { return this.svc.addUnit(id, d); }
  @Patch('units/:id') updUnit(@Param('id', Id()) id: string, @Body() d: UpdateUnitDto) { return this.svc.updateUnit(id, d); }
  @Delete('units/:id') delUnit(@Param('id', Id()) id: string) { return this.svc.deleteUnit(id); }
  @Post('units/:id/lessons') addLesson(@Param('id', Id()) id: string, @Body() d: CreateLessonDto) { return this.svc.addLesson(id, d); }
  @Patch('lessons/:id') updLesson(@Param('id', Id()) id: string, @Body() d: UpdateLessonDto) { return this.svc.updateLesson(id, d); }
  @Delete('lessons/:id') delLesson(@Param('id', Id()) id: string) { return this.svc.deleteLesson(id); }
  @Post('reorder') reorder(@Body() d: ReorderDto) { return this.svc.reorder(d); }

  // resources — the upload is received first, THEN the DB transaction opens (no connection held during slow uploads).
  @ManualTx()
  @Post('editions/:id/resources')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 20, uploadOpts))
  upload(@Param('id', Id()) id: string, @UploadedFiles() files: Express.Multer.File[], @Body() d: UploadResourcesDto, @Req() req: any) {
    return this.db.withContext(req.ctx, () => this.svc.uploadResources(id, files, d));
  }
  @ManualTx()
  @Post('components/:id/book-pdf')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('file', 1, uploadOpts))
  bookPdf(@Param('id', Id()) id: string, @UploadedFiles() files: Express.Multer.File[], @Req() req: any) {
    if (!files?.[0]) throw new BadRequestException('Choose a PDF file');
    // Upload, then (re)build the AI text index of this part in the background.
    return this.db.withContext(req.ctx, async () => ({ ...(await this.svc.setBookPdf(id, files[0])), indexing: (await this.indexer.start(id)).started }));
  }
  @Delete('components/:id/book-pdf') delBookPdf(@Param('id', Id()) id: string) { return this.svc.removeBookPdf(id); }
  @Patch('resources/:id') updRes(@Param('id', Id()) id: string, @Body() d: UpdateResourceDto) { return this.svc.updateResource(id, d); }
  @Delete('resources/:id') delRes(@Param('id', Id()) id: string) { return this.svc.deleteResource(id); }
}
