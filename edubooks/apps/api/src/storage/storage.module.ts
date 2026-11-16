import { Global, Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { FilesController } from './files.controller';
import { ChunkedController, ChunkedUploads } from './chunked.controller';
@Global()
@Module({ controllers: [FilesController, ChunkedController], providers: [AssetsService, ChunkedUploads], exports: [AssetsService, ChunkedUploads] })
export class StorageModule {}
