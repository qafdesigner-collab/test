import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQuery } from '../common/pagination';
import { Roles } from '../common/decorators';
import { AuditService } from './audit.service';

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsUUID() schoolId?: string;
  @IsOptional() @IsString() action?: string;
}

@ApiTags('audit')
@Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Query() q: AuditQuery) { return this.audit.list(q); }
}
