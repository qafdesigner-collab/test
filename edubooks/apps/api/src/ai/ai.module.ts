import { Module } from '@nestjs/common';
import { LmsModule } from '../lms/lms.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { IndexerService } from './indexer.service';
import { AiProviderService } from './provider.service';
import { RetrievalService } from './retrieval.service';
@Module({ imports: [LmsModule], controllers: [AiController], providers: [AiService, IndexerService, AiProviderService, RetrievalService], exports: [IndexerService] })
export class AiModule {}
