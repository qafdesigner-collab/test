import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { ManualTx, Public, Roles } from '../common/decorators';
import { Throttle } from '@nestjs/throttler';
import { LmsService } from './lms.service';
import { AssessmentDto, LiveFrameDto, PhoneScanDto, ProctorEventDto, EvaluationDto, GradeDto, LessonPlanDto, QuestionDto, SubmitDto, UpdateAssessmentDto } from './lms.dto';
import { LicensingService } from '../licensing/licensing.service';

class FromBankDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) questionIds: string[]; }
const Id = () => new ParseUUIDPipe();
const STAFF = ['TEACHER', 'SCHOOL_ADMIN'];

@ApiTags('teacher')
@Controller('teacher')
export class TeacherController {
  constructor(private readonly svc: LmsService, private readonly licensing: LicensingService) {}
  @Roles(...STAFF) @Get('books') books() { return this.licensing.library(); }

  @Roles('TEACHER') @Get('lesson-plans') plans(@Query('classId') classId?: string, @Query('lessonId') lessonId?: string) { return this.svc.listPlans({ classId, lessonId }); }
  @Roles('TEACHER') @Get('lesson-plans/:id') plan(@Param('id', Id()) id: string) { return this.svc.getPlan(id); }
  @Roles('TEACHER') @Post('lesson-plans') createPlan(@Body() d: LessonPlanDto) { return this.svc.savePlan(null, d); }
  @Roles('TEACHER') @Put('lesson-plans/:id') updatePlan(@Param('id', Id()) id: string, @Body() d: LessonPlanDto) { return this.svc.savePlan(id, d); }
  @Roles('TEACHER') @Post('lesson-plans/:id/duplicate') dup(@Param('id', Id()) id: string) { return this.svc.duplicatePlan(id); }
  @Roles('TEACHER') @Delete('lesson-plans/:id') delPlan(@Param('id', Id()) id: string) { return this.svc.deletePlan(id); }

  @Roles(...STAFF) @Get('question-bank') questions(@Query('editionId') editionId?: string, @Query('lessonId') lessonId?: string, @Query('type') type?: string) { return this.svc.listQuestions({ editionId, lessonId, type }); }
  @Roles('TEACHER') @Post('question-bank') addQuestion(@Body() d: QuestionDto) { return this.svc.addQuestion(d); }
  @Roles('TEACHER') @Delete('question-bank/:id') delQuestion(@Param('id', Id()) id: string) { return this.svc.deleteQuestion(id); }

  @Roles(...STAFF) @Get('assessments') list(@Query('classId') classId?: string, @Query('status') status?: string) { return this.svc.listAssessments({ classId, status }); }
  @Roles('TEACHER') @Post('assessments') create(@Body() d: AssessmentDto) { return this.svc.createAssessment(d); }
  @Roles(...STAFF) @Get('assessments/:id') get(@Param('id', Id()) id: string) { return this.svc.getAssessment(id); }
  @Roles('TEACHER') @Patch('assessments/:id') update(@Param('id', Id()) id: string, @Body() d: UpdateAssessmentDto) { return this.svc.updateAssessment(id, d); }
  @Roles('TEACHER') @Post('assessments/:id/publish') publish(@Param('id', Id()) id: string) { return this.svc.publish(id); }
  @Roles('TEACHER') @Post('assessments/:id/close') close(@Param('id', Id()) id: string) { return this.svc.close(id); }
  @Roles('TEACHER') @Post('assessments/:id/from-bank') fromBank(@Param('id', Id()) id: string, @Body() d: FromBankDto) { return this.svc.addFromBank(id, d.questionIds); }
  @Roles('TEACHER') @Delete('assessments/:id') del(@Param('id', Id()) id: string) { return this.svc.deleteAssessment(id); }
  @Roles(...STAFF) @Get('assessments/:id/watch/:studentId') watch(@Param('id', Id()) id: string, @Param('studentId', Id()) sid: string) { return this.svc.proctorLog(id, sid); }
  @Roles(...STAFF) @Get('watch/:eventId/image') async watchImage(@Param('eventId', Id()) eid: string, @Res() res: Response) {
    const f = await this.svc.proctorImage(eid); res.setHeader('Content-Type', f.mime); res.setHeader('Cache-Control', 'private, max-age=3600'); res.setHeader('Accept-Ranges', 'none'); res.end(f.bytes);
  }
  @Roles(...STAFF) @Get('assessments/:id/live') live(@Param('id', Id()) id: string) { return this.svc.liveList(id); }
  @Roles(...STAFF) @Get('assessments/:id/live/:studentId/:kind') async liveImage(@Param('id', Id()) id: string, @Param('studentId', Id()) sid: string, @Param('kind') kind: string, @Res() res: Response) {
    const b = await this.svc.liveImage(id, sid, kind); res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'no-store'); res.end(b);
  }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Delete('assessments/:id/watch') clearWatch(@Param('id', Id()) id: string) { return this.svc.proctorClear(id); }
  @Roles('TEACHER') @Patch('submissions/:id') grade(@Param('id', Id()) id: string, @Body() d: GradeDto) { return this.svc.grade(id, d); }

  @Roles(...STAFF) @Get('classes/:id/gradebook') gradebook(@Param('id', Id()) id: string) { return this.svc.gradebook(id); }
  @Roles(...STAFF) @Get('students/:id/report') report(@Param('id', Id()) id: string) { return this.svc.studentReport(id); }
  @Roles(...STAFF) @Post('evaluations') evaluate(@Body() d: EvaluationDto) { return this.svc.addEvaluation(d); }
  @Roles(...STAFF) @Delete('evaluations/:id') delEval(@Param('id', Id()) id: string) { return this.svc.deleteEvaluation(id); }
}

@ApiTags('student')
@Roles('STUDENT')
@Controller('student')
export class StudentController {
  constructor(private readonly svc: LmsService) {}
  @Get('homework') list() { return this.svc.studentList(); }
  @Get('homework/:id') get(@Param('id', Id()) id: string) { return this.svc.studentGet(id); }
  @Post('homework/:id/start') start(@Param('id', Id()) id: string) { return this.svc.startAttempt(id); }
  @Post('homework/:id/scan-link') scanLink(@Param('id', Id()) id: string) { return this.svc.createScanLink(id); }
  @Get('homework/:id/scan-link/:linkId') scanStatus(@Param('id', Id()) id: string, @Param('linkId', Id()) l: string) { return this.svc.scanLinkStatus(id, l); }
  @Get('homework/:id/scan-link/:linkId/panorama') async scanPano(@Param('id', Id()) id: string, @Param('linkId', Id()) l: string, @Res() res: Response) {
    const b = await this.svc.scanLinkPanorama(id, l); res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'no-store'); res.end(b);
  }
  @Post('homework/:id/live') live(@Param('id', Id()) id: string, @Body() d: LiveFrameDto) { return this.svc.liveFrame(id, d); }
  @Post('homework/:id/watch') watch(@Param('id', Id()) id: string, @Body() d: ProctorEventDto) { return this.svc.proctorEvent(id, d); }
  @Post('homework/:id/submit') submit(@Param('id', Id()) id: string, @Body() d: SubmitDto) { return this.svc.submit(id, d); }
  @Get('report') report() { return this.svc.studentReport(this.svc.db.ctx.userId); }
}

/** Room scan on a phone: no login — the phone only has the secret one-time link from the student's QR code. */
@ApiTags('student')
@Controller('room-scan')
export class RoomScanController {
  constructor(private readonly svc: LmsService) {}
  @Public() @ManualTx() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Get(':token')
  async info(@Param('token') token: string) { if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('This link is not valid.'); const r = await this.svc.phoneScanInfo(token); return { title: r.title, expiresAt: r.expiresAt }; }
  @Public() @ManualTx() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post(':token')
  save(@Param('token') token: string, @Body() d: PhoneScanDto) { if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('This link is not valid.'); return this.svc.phoneScanSave(token, d); }
}
