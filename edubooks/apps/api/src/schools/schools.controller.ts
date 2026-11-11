import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { SchoolsService } from './schools.service';

class SchoolQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: string;
  @IsOptional() @IsIn(['true', 'false']) demo?: string;
}
class CreateSchoolDto {
  @IsString() @Length(2, 160) name: string;
  @Matches(/^[A-Za-z0-9-]{3,20}$/, { message: 'School code: 3–20 letters, digits or dashes' }) code: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsString() @Length(2, 120) adminName: string;
  @Matches(/^[a-z0-9._-]{3,40}$/, { message: 'Admin username: 3–40 lowercase letters, digits, dot, dash or underscore' }) adminUsername: string;
  @IsString() @Length(8, 200) adminPassword: string;
}
class UpdateSchoolDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}
class AcademicYearDto {
  @IsString() @Length(2, 40) name: string;
  @IsDateString() startsOn: string;
  @IsDateString() endsOn: string;
}
class DemoDto {
  @IsString() @Length(2, 160) name: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) contact?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('all', { each: true }) productVersionIds: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(60) days: number;
}
class ExtendDto { @Type(() => Number) @IsInt() @Min(1) @Max(60) days: number; }
class EraseDto { @IsString() @Length(1, 40) confirmUsername: string; }
class ReasonDto { @IsOptional() @IsString() @MaxLength(300) reason?: string; }
const Id = () => new ParseUUIDPipe();
const SALES = ['PUBLISHER_ADMIN', 'PUBLISHER_SALES'];

@ApiTags('schools (publisher)')
@Controller('schools')
export class SchoolsController {
  constructor(private readonly svc: SchoolsService) {}
  @Roles(...SALES, 'PUBLISHER_EDITOR') @Get() list(@Query() q: SchoolQuery) { return this.svc.list(q); }
  @Roles(...SALES) @Post() create(@Body() d: CreateSchoolDto) { return this.svc.create(d); }
  @Roles(...SALES) @Post('demo') demo(@Body() d: DemoDto) { return this.svc.createDemo(d); }
  @Roles(...SALES, 'PUBLISHER_EDITOR') @Get(':id') get(@Param('id', Id()) id: string) { return this.svc.get(id); }
  @Roles(...SALES) @Patch(':id') update(@Param('id', Id()) id: string, @Body() d: UpdateSchoolDto) { return this.svc.update(id, d); }
  @Roles('PUBLISHER_ADMIN') @Post(':id/suspend') suspend(@Param('id', Id()) id: string, @Body() d: ReasonDto) { return this.svc.setStatus(id, 'SUSPENDED', d.reason); }
  @Roles('PUBLISHER_ADMIN') @Post(':id/reactivate') reactivate(@Param('id', Id()) id: string) { return this.svc.setStatus(id, 'ACTIVE'); }
  @Roles(...SALES) @Post(':id/academic-years') addYear(@Param('id', Id()) id: string, @Body() d: AcademicYearDto) { return this.svc.addAcademicYear(id, d); }
  @Roles('PUBLISHER_ADMIN') @Post(':id/admins/:userId/reset-password') reset(@Param('id', Id()) id: string, @Param('userId', Id()) userId: string) { return this.svc.resetAdminPassword(id, userId); }
  @Roles('PUBLISHER_ADMIN') @Post(':id/students/:userId/erase') erase(@Param('id', Id()) id: string, @Param('userId', Id()) userId: string, @Body() d: EraseDto) { return this.svc.eraseStudent(id, userId, d.confirmUsername); }
  @Roles('PUBLISHER_ADMIN') @Post(':id/convert-demo') convert(@Param('id', Id()) id: string) { return this.svc.convertDemo(id); }
  @Roles(...SALES) @Post(':id/extend-demo') extend(@Param('id', Id()) id: string, @Body() d: ExtendDto) { return this.svc.extendDemo(id, d.days); }
}
