import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { AiService } from './ai.service';
import { IndexerService } from './indexer.service';
import { TASKS } from './tasks';

class GenerateDto {
  @IsIn(Object.keys(TASKS)) task: keyof typeof TASKS;
  @IsUUID() editionId: string;
  @IsOptional() @IsUUID() lessonId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(180) durationMin?: number;
  @IsOptional() @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) count?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
class UseDto {
  @IsIn(['LESSON_PLAN', 'ASSESSMENT', 'QUESTION_BANK']) as: 'LESSON_PLAN' | 'ASSESSMENT' | 'QUESTION_BANK';
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  /** The teacher's edited version of the draft. */
  @IsOptional() @IsObject() output?: Record<string, unknown>;
}
const Id = () => new ParseUUIDPipe();

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService, private readonly indexer: IndexerService) {}
  @Roles('TEACHER', 'SCHOOL_ADMIN', 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Get('status') status() { return this.ai.status(); }
  @Roles('TEACHER') @Throttle({ default: { limit: Number(process.env.AI_RATE_LIMIT_PER_MIN || 10), ttl: 60_000 } })
  @Post('generate') generate(@Body() d: GenerateDto) { return this.ai.generate(d); }
  @Roles('TEACHER') @Get('generations') history() { return this.ai.history(); }
  @Roles('TEACHER') @Get('generations/:id') get(@Param('id', Id()) id: string) { return this.ai.get(id); }
  @Roles('TEACHER') @Post('generations/:id/use') use(@Param('id', Id()) id: string, @Body() d: UseDto) { return this.ai.use(id, d); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN') @Get('usage') usage() { return this.ai.usage(); }

  // Publisher: the text index the assistant is grounded in.
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Get('index/editions/:id') indexStatus(@Param('id', Id()) id: string) { return this.indexer.status(id); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Post('index/components/:id') index(@Param('id', Id()) id: string) { return this.indexer.start(id); }
}
