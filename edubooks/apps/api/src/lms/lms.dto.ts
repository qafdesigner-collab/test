import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export const QTYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT', 'READING'] as const;
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

export class ProctorDto {
  /** camera photos at random times */
  @IsOptional() @IsBoolean() camera?: boolean;
  /** turn the camera around the room before starting */
  @IsOptional() @IsBoolean() roomScan?: boolean;
  /** share the whole screen; pictures of it at random times */
  @IsOptional() @IsBoolean() screen?: boolean;
}
export class ProctorEventDto {
  @IsIn(['ROOM', 'CAMERA', 'SCREEN', 'AWAY', 'SCREEN_OFF', 'CAMERA_OFF', 'SCREEN_PART', 'NO_SCREEN', 'NO_CAMERA', 'FULLSCREEN_OFF']) kind: string;
  @IsOptional() @IsString() @MaxLength(800_000) image?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(86400) seconds?: number;
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
  @IsOptional() @IsUUID() bookComponentId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) bookPage?: number | null;
  /** how many times a student may hand it in (1–3) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) maxAttempts?: number;
  /** minutes allowed once a student starts (null: no limit) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(600) timeLimitMin?: number | null;
  @IsOptional() @ValidateNested() @Type(() => ProctorDto) proctor?: ProctorDto;
}
export class UpdateAssessmentDto {
  @IsOptional() @IsString() @Length(2, 200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) studentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemDto) items?: ItemDto[];
  @IsOptional() @IsUUID() bookComponentId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) bookPage?: number | null;
  /** how many times a student may hand it in (1–3) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) maxAttempts?: number;
  /** minutes allowed once a student starts (null: no limit) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(600) timeLimitMin?: number | null;
  @IsOptional() @ValidateNested() @Type(() => ProctorDto) proctor?: ProctorDto;
}

export class ResponseDto { @IsUUID() itemId: string; @IsDefined() response: string | number | boolean; }
export class SignalDto {
  @IsUUID() itemId: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) pasted: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100_000) pastes: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) typed: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(86_400_000) ms: number;
}
export class SubmitDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ResponseDto) answers: ResponseDto[];
  /** how each written answer was made (sent by the app) */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SignalDto) signals?: SignalDto[];
}

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
