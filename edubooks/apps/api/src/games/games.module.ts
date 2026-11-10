import { Module } from '@nestjs/common';
import { LmsModule } from '../lms/lms.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
@Module({ imports: [LmsModule], controllers: [GamesController], providers: [GamesService] })
export class GamesModule {}
