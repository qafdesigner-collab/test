import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsHexColor, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

export const COMPONENT_TYPES = ['STUDENT_BOOK', 'HOMEWORK_BOOK', 'WORKBOOK', 'TEACHER_GUIDE', 'FLASHCARDS', 'TEACHER_CARDS', 'DANGLERS', 'POSTERS', 'OTHER'] as const;
export const RESOURCE_TYPES = ['PDF', 'PRESENTATION', 'DOCUMENT', 'SPREADSHEET', 'HTML5', 'IMAGE', 'AUDIO', 'VIDEO',
  'FLASHCARD', 'TEACHER_CARD', 'DANGLER', 'POSTER', 'WORKSHEET', 'GAME', 'OTHER'] as const;
export const AUDIENCES = ['TEACHER', 'STUDENT', 'ALL'] as const;
export const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export class PackageQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() gradeId?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
}

export class CreatePackageDto {
  @ApiProperty({ example: 'KG English' }) @IsString() @Length(2, 120) title: string;
  @ApiProperty() @IsUUID() gradeId: string;
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() coverColor?: string;
  @ApiProperty({ example: '2026 Edition' }) @IsString() @Length(1, 60) editionLabel: string;
  @ApiProperty({ example: 2026 }) @Type(() => Number) @IsInt() @Min(1990) @Max(2100) editionYear: number;
  @ApiPropertyOptional({ description: 'Create Student Book Parts 1–3, Homework Book, Teacher Guide, Flashcards, Teacher Cards, Danglers' })
  @IsOptional() @IsBoolean() standardStructure?: boolean;
  @ApiPropertyOptional({ description: 'Number of student book parts for the standard structure', default: 3 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) parts?: number;
}
export class UpdatePackageDto extends PartialType(PickType(CreatePackageDto, ['title', 'gradeId', 'subjectId', 'description', 'coverColor'] as const)) {}

export class CreateEditionDto {
  @ApiProperty() @IsString() @Length(1, 60) label: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1990) @Max(2100) editionYear: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ description: 'Copy structure & resources (files are shared, not duplicated)' }) @IsOptional() @IsUUID() cloneFromEditionId?: string;
}
export class UpdateEditionDto extends PartialType(PickType(CreateEditionDto, ['label', 'editionYear', 'notes'] as const)) {}

export class CreateComponentDto {
  @ApiProperty({ enum: COMPONENT_TYPES }) @IsEnum(COMPONENT_TYPES) type: (typeof COMPONENT_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 120) title: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) partNumber?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pageCount?: number | null;
}
export class UpdateComponentDto extends PartialType(CreateComponentDto) {}

export class CreateUnitDto {
  @ApiProperty() @IsString() @Length(1, 160) title: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) number?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

export class CreateLessonDto {
  @ApiProperty() @IsString() @Length(1, 160) title: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) number?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) objectives?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pageStart?: number | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pageEnd?: number | null;
}
export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class ReorderDto {
  @ApiProperty({ enum: ['component', 'unit', 'lesson', 'resource'] }) @IsIn(['component', 'unit', 'lesson', 'resource']) kind: 'component' | 'unit' | 'lesson' | 'resource';
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids: string[];
}

/** Multipart fields that accompany uploaded files. Only the narrowest scope id is needed. */
export class UploadResourcesDto {
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsUUID() lessonId?: string;
  @IsOptional() @IsEnum(RESOURCE_TYPES) resourceType?: (typeof RESOURCE_TYPES)[number];
  @IsOptional() @IsEnum(AUDIENCES) audience?: (typeof AUDIENCES)[number];
  @IsOptional() @IsString() @MaxLength(200) title?: string;
}
export class UpdateResourceDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsEnum(RESOURCE_TYPES) resourceType?: (typeof RESOURCE_TYPES)[number];
  @IsOptional() @IsEnum(AUDIENCES) audience?: (typeof AUDIENCES)[number];
  @IsOptional() @IsUUID() componentId?: string | null;
  @IsOptional() @IsUUID() unitId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
}
