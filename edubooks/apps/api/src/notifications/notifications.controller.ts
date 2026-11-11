import { Body, Controller, Get, Global, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { ManualTx, Roles } from '../common/decorators';
import { NotificationsService } from './notifications.service';

class TestDto { @IsString() @MaxLength(30) phone: string }

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  @Get() list(@Query('unread') unread?: string) { return this.svc.list(unread === '1'); }
  @Get('count') count() { return this.svc.unread(); }
  @Post('read-all') readAll() { return this.svc.markAll(); }
  @Post(':id/read') read(@Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(id); }

  @Roles('PUBLISHER_ADMIN', 'SCHOOL_ADMIN') @Get('outbox') outbox() { return this.svc.outbox(); }
  @Roles('PUBLISHER_ADMIN') @Get('channel') channel() { return this.svc.channel(); }
  @Roles('PUBLISHER_ADMIN') @Post('test') test(@Body() d: TestDto) { return this.svc.test(d.phone); }
  /** Runs reminders and sends queued messages now (normally automatic). */
  @Roles('PUBLISHER_ADMIN') @ManualTx() @Post('run') run() { return this.svc.runReminders(); }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
