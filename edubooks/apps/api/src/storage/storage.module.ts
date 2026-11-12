import { Global, Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { FilesController } from './files.controller';
@Global()
@Module({ controllers: [FilesController], providers: [AssetsService], exports: [AssetsService] })
export class StorageModule {}
