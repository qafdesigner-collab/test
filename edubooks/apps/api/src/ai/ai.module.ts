import { AiSettingsController, OcrController, SchoolAiAdminController, SchoolAiController } from './ai-settings.controller';
import { Module } from '@nestjs/common';
import { LmsModule } from '../lms/lms.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { IndexerService } from './indexer.service';
import { AiProviderService } from './provider.service';
import { RetrievalService } from './retrieval.service';
import { TutorController, TutorService } from './tutor';
@Module({ imports: [LmsModule], controllers: [AiSettingsController, OcrController, SchoolAiAdminController, SchoolAiController, AiController, TutorController], providers: [AiService, IndexerService, AiProviderService, RetrievalService, TutorService], exports: [IndexerService] })
export class AiModule {}
