import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { sql } from 'drizzle-orm';
import { Ctx, PUBLISHER_STAFF, Roles } from '../common/decorators';
import { DbService, TenantCtx } from '../db/db.service';
import { LmsService } from '../lms/lms.service';
import { ENGINES, Engine } from './engines';
import { GamesService } from './games.service';

class GameDto {
  @IsIn(ENGINES) engine: Engine;
  @IsString() @Length(2, 120) title: string;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) difficulty?: number;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsDefined() content: unknown;
  @IsOptional() @IsBoolean() published?: boolean;
}
class UpdateGameDto {
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) difficulty?: number;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsOptional() content?: unknown;
  @IsOptional() @IsBoolean() published?: boolean;
}
class AssignDto { @IsUUID() classId: string; @IsOptional() @IsDateString() dueAt?: string | null; }
class AttemptDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(1000) score: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMs?: number;
}
const Id = () => new ParseUUIDPipe();

@ApiTags('games')
@Controller()
export class GamesController {
  constructor(private readonly games: GamesService, private readonly lms: LmsService, private readonly db: DbService) {}

  // Publisher library
  @Roles(...PUBLISHER_STAFF) @Get('publishing/games') library(@Query('editionId') editionId?: string, @Query('engine') engine?: string) { return this.games.libraryList({ editionId, engine }); }
  @Roles(...PUBLISHER_STAFF) @Get('publishing/games/:id') libGet(@Param('id', Id()) id: string) { return this.games.get(id); }
  @Roles(...PUBLISHER_STAFF) @Post('publishing/games') libCreate(@Body() d: GameDto) { return this.games.create(d, null); }
  @Roles(...PUBLISHER_STAFF) @Patch('publishing/games/:id') libUpdate(@Param('id', Id()) id: string, @Body() d: UpdateGameDto) { return this.games.update(id, d, null); }
  @Roles(...PUBLISHER_STAFF) @Delete('publishing/games/:id') libDelete(@Param('id', Id()) id: string) { return this.games.remove(id, null); }

  // Teacher
  @Roles('TEACHER') @Get('teacher/games') tList(@Query('editionId') editionId?: string, @Query('lessonId') lessonId?: string) { return this.games.teacherList({ editionId, lessonId }); }
  @Roles('TEACHER') @Get('teacher/games/:id') tGet(@Param('id', Id()) id: string) { return this.games.teacherGet(id); }
  @Roles('TEACHER') @Post('teacher/games') tCreate(@Body() d: GameDto, @Ctx() c: TenantCtx) { return this.games.create(d, c.schoolId); }
  @Roles('TEACHER') @Patch('teacher/games/:id') tUpdate(@Param('id', Id()) id: string, @Body() d: UpdateGameDto, @Ctx() c: TenantCtx) { return this.games.update(id, d, c.schoolId); }
  @Roles('TEACHER') @Delete('teacher/games/:id') tDelete(@Param('id', Id()) id: string, @Ctx() c: TenantCtx) { return this.games.remove(id, c.schoolId); }
  @Roles('TEACHER') @Post('teacher/games/:id/assign') assign(@Param('id', Id()) id: string, @Body() d: AssignDto) { return this.games.assign(id, d.classId, d.dueAt); }
  @Roles('TEACHER') @Delete('teacher/game-assignments/:id') unassign(@Param('id', Id()) id: string) { return this.games.unassign(id); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('teacher/classes/:id/games') report(@Param('id', Id()) id: string) { return this.games.classReport(id); }

  // Student
  @Roles('STUDENT') @Get('student/games') sList() { return this.games.studentAvailable(); }
  @Roles('STUDENT') @Get('student/games/:id') sGet(@Param('id', Id()) id: string) { return this.games.studentGet(id); }
  @Roles('STUDENT') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('student/games/:id/attempts') attempt(@Param('id', Id()) id: string, @Body() d: AttemptDto) { return this.games.recordAttempt(id, d); }
  @Roles('STUDENT') @Get('student/achievements') achievements() { return this.games.achievements(); }

  /** One call for the child's home screen. */
  @Roles('STUDENT') @Get('student/home')
  async home(@Ctx() c: TenantCtx) {
    const { rows } = await this.db.q.execute(sql`SELECT rp.last_page AS page, rp.component_id AS "componentId", c.title AS part, e.id AS "editionId", p.title, p.cover_color AS "coverColor", CASE WHEN p.cover_version IS NOT NULL THEN '/api/covers/' || p.id || '?v=' || p.cover_version END AS "coverUrl", c.page_count AS "pageCount"
      FROM reader_progress rp JOIN book_components c ON c.id = rp.component_id JOIN book_editions e ON e.id = c.edition_id JOIN book_packages p ON p.id = e.package_id
      WHERE rp.user_id = ${c.userId} ORDER BY rp.updated_at DESC LIMIT 1`);
    // Sequential: all queries share the request's single transaction connection.
    const homework = await this.lms.studentList(); const games = await this.games.studentAvailable(); const ach = await this.games.achievements();
    const today = ((await this.db.q.execute(sql`SELECT coalesce(sum(reading), 0)::int AS reading, coalesce(sum(games), 0)::int AS games, coalesce(sum(homework), 0)::int AS homework
      FROM user_activity WHERE user_id = ${c.userId} AND day = current_date`)).rows[0] ?? { reading: 0, games: 0, homework: 0 }) as any;
    return {
      today,
      continueReading: rows[0] ?? null,
      homework: homework.filter((h: any) => !h.submission && h.status === 'PUBLISHED'),
      games: games.slice(0, 8),
      stars: ach.stars, streak: ach.streak, badges: ach.badges.filter((b) => b.earnedAt).sort((a, b) => +new Date(b.earnedAt!) - +new Date(a.earnedAt!)).slice(0, 4),
    };
  }
}
