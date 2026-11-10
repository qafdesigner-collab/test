import { Module, OnModuleInit } from '@nestjs/common';
import { CommerceModule } from '../commerce/commerce.module';
import { AssetsService } from '../storage/assets.service';
import { LibraryController, LicensingController } from './licensing.controller';
import { LicensingService } from './licensing.service';

@Module({ imports: [CommerceModule], controllers: [LicensingController, LibraryController], providers: [LicensingService], exports: [LicensingService] })
export class LicensingModule implements OnModuleInit {
  constructor(private readonly assets: AssetsService, private readonly licensing: LicensingService) {}
  /** File access for school users is decided by licence entitlements. */
  onModuleInit() { this.assets.setAccessChecker((assetId) => this.licensing.canAccessAsset(assetId)); }
}
