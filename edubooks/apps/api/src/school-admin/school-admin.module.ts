import { Module } from '@nestjs/common';
import { LicensingModule } from '../licensing/licensing.module';
import { SchoolsModule } from '../schools/schools.module';
import { SchoolAdminController } from './school-admin.controller';
@Module({ imports: [LicensingModule, SchoolsModule], controllers: [SchoolAdminController] })
export class SchoolAdminModule {}
