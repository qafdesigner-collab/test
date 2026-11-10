import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { ReaderService } from './reader.service';

class ProgressDto { @IsUUID() componentId: string; @Type(() => Number) @IsInt() @Min(1) @Max(5000) page: number; }
class BookmarkDto extends ProgressDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
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
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Delete('bookmarks/:id') unbookmark(@Param('id', Id()) id: string) { return this.svc.removeBookmark(id); }
}
