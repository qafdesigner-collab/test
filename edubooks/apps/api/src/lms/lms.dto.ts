import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export const QTYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT'] as const;
export type QType = (typeof QTYPES)[number];

export class ItemDto {
  @IsEnum(QTYPES) type: QType;
  @IsString() @Length(1, 2000) prompt: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) options?: string[];
  /** MCQ: [correctIndex] · TRUE_FALSE: [true|false] · FILL_BLANK: accepted answers · SHORT: optional model answer */
  @IsOptional() @IsArray() @ArrayMaxSize(10) answer?: (string | number | boolean)[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) points?: number;
}

export class LessonPlanDto {
  @IsString() @Length(2, 200) title: string;
  @IsOptional() @IsUUID() classId?: string | null;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsOptional() @IsDateString() planDate?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(300) durationMin?: number;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsIn(['DRAFT', 'READY']) status?: 'DRAFT' | 'READY';
  @IsOptional() @IsBoolean() aiGenerated?: boolean;
}

export class QuestionDto extends ItemDto {
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) difficulty?: number;
  @IsOptional() @IsBoolean() shared?: boolean;
}

export class AssessmentDto {
  @IsUUID() classId: string;
  @IsEnum(['HOMEWORK', 'QUIZ', 'TEST']) kind: 'HOMEWORK' | 'QUIZ' | 'TEST';
  @IsString() @Length(2, 200) title: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() unitId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) studentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemDto) items?: ItemDto[];
}
export class UpdateAssessmentDto {
  @IsOptional() @IsString() @Length(2, 200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) studentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemDto) items?: ItemDto[];
}

export class ResponseDto { @IsUUID() itemId: string; @IsDefined() response: string | number | boolean; }
export class SubmitDto { @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ResponseDto) answers: ResponseDto[]; }

export class ItemScoreDto { @IsUUID() itemId: string; @Type(() => Number) @IsInt() @Min(0) @Max(100) awarded: number; }
export class GradeDto {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemScoreDto) itemScores?: ItemScoreDto[];
  @IsOptional() @IsString() @MaxLength(4000) feedback?: string;
  @IsOptional() @IsBoolean() returnToStudent?: boolean;
}

export class EvaluationDto {
  @IsUUID() studentId: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsString() @MaxLength(40) term?: string;
  @IsString() @Length(2, 80) skill: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}
