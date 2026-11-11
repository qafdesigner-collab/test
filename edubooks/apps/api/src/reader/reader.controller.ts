import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { ReaderService } from './reader.service';

class ProgressDto { @IsUUID() componentId: string; @Type(() => Number) @IsInt() @Min(1) @Max(5000) page: number; }
class BookmarkDto extends ProgressDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
export class HotspotDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5000) page: number;
  @IsNumber() @Min(0) @Max(1) x: number; @IsNumber() @Min(0) @Max(1) y: number;
  @IsNumber() @Min(0.01) @Max(1) w: number; @IsNumber() @Min(0.01) @Max(1) h: number;
  @IsIn(['NOTE', 'AUDIO', 'VIDEO', 'LINK', 'GAME']) kind: 'NOTE' | 'AUDIO' | 'VIDEO' | 'LINK' | 'GAME';
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string | null;
  @IsOptional() @IsUUID() gameId?: string | null;
}
class UpdateHotspotDto extends PartialType(HotspotDto) {}
const Id = () => new ParseUUIDPipe();
const READERS = ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'];

@ApiTags('reader')
@Roles(...READERS)
@Controller('reader')
export class ReaderController {
  constructor(private readonly svc: ReaderService) {}
  @Get('editions/:id') edition(@Param('id', Id()) id: string) { return this.svc.edition(id); }
  @Get('components/:id/pdf') pdf(@Param('id', Id()) id: string) { return this.svc.pdfLink(id); }
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Put('progress') progress(@Body() d: ProgressDto) { return this.svc.saveProgress(d.componentId, d.page); }
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Post('bookmarks') bookmark(@Body() d: BookmarkDto) { return this.svc.addBookmark(d.componentId, d.page, d.note ?? ''); }
  @Get('components/:id/hotspots') hotspots(@Param('id', Id()) id: string) { return this.svc.hotspots(id); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Post('components/:id/hotspots') addHotspot(@Param('id', Id()) id: string, @Body() d: HotspotDto) { return this.svc.addHotspot(id, d); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Patch('hotspots/:id') updHotspot(@Param('id', Id()) id: string, @Body() d: UpdateHotspotDto) { return this.svc.updateHotspot(id, d); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Delete('hotspots/:id') delHotspot(@Param('id', Id()) id: string) { return this.svc.removeHotspot(id); }
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Delete('bookmarks/:id') unbookmark(@Param('id', Id()) id: string) { return this.svc.removeBookmark(id); }
}
