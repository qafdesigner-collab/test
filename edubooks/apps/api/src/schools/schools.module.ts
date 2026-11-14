import { Module } from '@nestjs/common';
import { LicensingModule } from '../licensing/licensing.module';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { SchoolUsersService } from './school-users.service';
@Module({ imports: [LicensingModule], controllers: [SchoolsController], providers: [SchoolsService, SchoolUsersService], exports: [SchoolUsersService] })
export class SchoolsModule {}
