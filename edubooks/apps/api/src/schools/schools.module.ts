import { RegistrationController } from './registration.controller';
import { Module } from '@nestjs/common';
import { LicensingModule } from '../licensing/licensing.module';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { SchoolUsersService } from './school-users.service';
@Module({ imports: [LicensingModule], controllers: [RegistrationController, SchoolsController], providers: [SchoolsService, SchoolUsersService], exports: [SchoolUsersService, SchoolsService] })
export class SchoolsModule {}
