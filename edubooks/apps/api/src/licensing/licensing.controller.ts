import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { LicensingService } from './licensing.service';

class PoolQuery {
  @IsOptional() @IsUUID() schoolId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']) status?: string;
  @IsOptional() @IsIn(['STUDENT', 'TEACHER']) seatType?: string;
}
class TransferQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) status?: string;
  @IsOptional() @IsUUID() schoolId?: string;
}
export class ReasonDto { @IsString() @Length(3, 500) reason: string; }
class OptionalReasonDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; }
class NoteDto { @IsOptional() @IsString() @MaxLength(500) note?: string; }
class RevokeSeatsDto extends ReasonDto { @Type(() => Number) @IsInt() @Min(1) @Max(100000) count: number; }
class AdjustmentDto {
  @IsUUID() schoolId: string;
  @IsUUID() academicYearId: string;
  @IsUUID() productVersionId: string;
  @IsEnum(['STUDENT', 'TEACHER']) seatType: 'STUDENT' | 'TEACHER';
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) quantity: number;
  @IsEnum(['COMPLIMENTARY', 'TRIAL', 'CORRECTION']) kind: 'COMPLIMENTARY' | 'TRIAL' | 'CORRECTION';
  @IsString() @Length(3, 500) reason: string;
  @IsOptional() @IsDateString() validUntil?: string;
}
const Id = () => new ParseUUIDPipe();
const READ = ['PUBLISHER_ADMIN', 'PUBLISHER_SALES', 'PUBLISHER_EDITOR'];

@ApiTags('licensing (publisher)')
@Controller('licensing')
export class LicensingController {
  constructor(private readonly svc: LicensingService) {}
  @Roles(...READ) @Get('dashboard') dashboard(@Query('schoolId') schoolId?: string) { return this.svc.dashboard(schoolId || undefined); }
  @Roles(...READ) @Get('pools') pools(@Query() q: PoolQuery) { return this.svc.listPools(q); }
  @Roles(...READ) @Get('pools/:id') pool(@Param('id', Id()) id: string) { return this.svc.getPool(id); }
  @Roles(...READ) @Get('reports/usage') usage() { return this.svc.usageReport(); }
  @Roles(...READ) @Get('transfers') transfers(@Query() q: TransferQuery) { return this.svc.listTransfers(q); }

  @Roles('PUBLISHER_ADMIN') @Post('adjustments') adjust(@Body() d: AdjustmentDto) { return this.svc.createAdjustment(d); }
  @Roles('PUBLISHER_ADMIN') @Post('pools/:id/suspend') suspendPool(@Param('id', Id()) id: string, @Body() d: OptionalReasonDto) { return this.svc.setPoolSuspended(id, true, d.reason); }
  @Roles('PUBLISHER_ADMIN') @Post('pools/:id/reactivate') reactivatePool(@Param('id', Id()) id: string) { return this.svc.setPoolSuspended(id, false); }
  @Roles('PUBLISHER_ADMIN') @Post('pools/:id/revoke-seats') revokeSeats(@Param('id', Id()) id: string, @Body() d: RevokeSeatsDto) { return this.svc.revokeUnassignedSeats(id, d.count, d.reason); }
  @Roles('PUBLISHER_ADMIN') @Post('assignments/:id/suspend') suspend(@Param('id', Id()) id: string, @Body() d: OptionalReasonDto) { return this.svc.setAssignmentSuspended(id, true, d.reason); }
  @Roles('PUBLISHER_ADMIN') @Post('assignments/:id/reactivate') reactivate(@Param('id', Id()) id: string) { return this.svc.setAssignmentSuspended(id, false); }
  @Roles('PUBLISHER_ADMIN') @Post('assignments/:id/revoke') revoke(@Param('id', Id()) id: string, @Body() d: ReasonDto) { return this.svc.revoke(id, d.reason); }
  @Roles('PUBLISHER_ADMIN') @Post('transfers/:id/approve') approve(@Param('id', Id()) id: string, @Body() d: NoteDto) { return this.svc.approveTransfer(id, d.note); }
  @Roles('PUBLISHER_ADMIN') @Post('transfers/:id/reject') reject(@Param('id', Id()) id: string, @Body() d: NoteDto) { return this.svc.decideTransfer(id, 'REJECTED', d.note); }
  @Roles('PUBLISHER_ADMIN') @Post('run-expiry') expire() { return this.svc.expireNow().then((expiredPools) => ({ expiredPools })); }
}

/** Any signed-in school user: the books they may open. */
@ApiTags('library')
@Controller('library')
export class LibraryController {
  constructor(private readonly svc: LicensingService) {}
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Get() library() { return this.svc.library(); }
}
