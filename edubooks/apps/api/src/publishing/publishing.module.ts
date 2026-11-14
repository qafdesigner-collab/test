import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PublishingController } from './publishing.controller';
import { PublishingService } from './publishing.service';
@Module({ imports: [AiModule], controllers: [PublishingController], providers: [PublishingService], exports: [PublishingService] })
export class PublishingModule {}
