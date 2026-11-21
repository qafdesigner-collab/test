import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { Roles } from '../common/decorators';
import { ClassesService } from './classes.service';

class CreateClassDto {
  @IsUUID() academicYearId: string;
  @IsOptional() @IsUUID() gradeId?: string;
  @IsString() @Length(1, 60) name: string;
  @IsOptional() @IsString() @MaxLength(20) section?: string;
}
class UpdateClassDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsString() @MaxLength(20) section?: string;
  @IsOptional() @IsUUID() gradeId?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
}
class TeacherRef { @IsUUID() userId: string; @IsOptional() @IsUUID() subjectId?: string | null; }
class TeachersDto { @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TeacherRef) teachers: TeacherRef[]; }
class EnrolDto { @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) studentIds: string[]; }
const Id = () => new ParseUUIDPipe();

@ApiTags('classes')
@Controller('classes')
export class ClassesController {
  constructor(private readonly svc: ClassesService) {}
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get() list(@Query('academicYearId') ay?: string, @Query('mine') mine?: string) { return this.svc.list({ academicYearId: ay || undefined, mine: mine === 'true' }); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get('options') async options() { return { grades: await this.svc.grades(), subjects: await this.svc.subjects() }; }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get(':id') get(@Param('id', Id()) id: string) { return this.svc.get(id); }
  @Roles('SCHOOL_ADMIN') @Post() create(@Body() d: CreateClassDto) { return this.svc.create(d); }
  @Roles('SCHOOL_ADMIN') @Patch(':id') update(@Param('id', Id()) id: string, @Body() d: UpdateClassDto) { return this.svc.update(id, d); }
  @Roles('SCHOOL_ADMIN') @Post(':id/teachers') teachers(@Param('id', Id()) id: string, @Body() d: TeachersDto) { return this.svc.setTeachers(id, d.teachers); }
  @Roles('SCHOOL_ADMIN') @Get(':id/unplaced') unplaced(@Param('id', Id()) id: string) { return this.svc.unplaced(id); }
  @Roles('SCHOOL_ADMIN') @Post(':id/students') enrol(@Param('id', Id()) id: string, @Body() d: EnrolDto) { return this.svc.enrol(id, d.studentIds); }
  @Roles('SCHOOL_ADMIN') @Delete(':id/students/:studentId') unenrol(@Param('id', Id()) id: string, @Param('studentId', Id()) s: string) { return this.svc.unenrol(id, s); }
}
