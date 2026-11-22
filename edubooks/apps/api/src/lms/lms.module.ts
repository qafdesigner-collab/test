import { Module } from '@nestjs/common';
import { LicensingModule } from '../licensing/licensing.module';
import { AccessService } from './access.service';
import { LmsService } from './lms.service';
import { ProctorCleanup } from './proctor-cleanup';
import { StudentController, TeacherController } from './lms.controller';
import { ClassesController } from '../classes/classes.controller';
import { ClassesService } from '../classes/classes.service';
import { ReaderController } from '../reader/reader.controller';
import { ReaderService } from '../reader/reader.service';

@Module({
  imports: [LicensingModule],
  controllers: [ClassesController, ReaderController, TeacherController, StudentController],
  providers: [AccessService, LmsService, ProctorCleanup, ClassesService, ReaderService],
  exports: [AccessService, LmsService, ProctorCleanup],
})
export class LmsModule {}
