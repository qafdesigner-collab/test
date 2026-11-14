import { Module } from '@nestjs/common';
import { CatalogController, CatalogService } from './catalog.controller';
@Module({ controllers: [CatalogController], providers: [CatalogService] })
export class CatalogModule {}
