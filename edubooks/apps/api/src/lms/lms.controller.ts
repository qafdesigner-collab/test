import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { Roles } from '../common/decorators';
import { LmsService } from './lms.service';
import { AssessmentDto, EvaluationDto, GradeDto, LessonPlanDto, QuestionDto, SubmitDto, UpdateAssessmentDto } from './lms.dto';
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
  @Post('homework/:id/submit') submit(@Param('id', Id()) id: string, @Body() d: SubmitDto) { return this.svc.submit(id, d); }
  @Get('report') report() { return this.svc.studentReport(this.svc.db.ctx.userId); }
}
