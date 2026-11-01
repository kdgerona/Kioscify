import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { RewardTypeRegistry } from './reward-type.registry';
import { PriceTiersModule } from '../price-tiers/price-tiers.module';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { StorePrivilegeGuard } from '../common/guards/store-privilege.guard';

@Module({
  imports: [PriceTiersModule],
  controllers: [RewardsController],
  providers: [
    RewardsService,
    RewardTypeRegistry,
    PrivilegeGuard,
    StorePrivilegeGuard,
  ],
  exports: [RewardsService, RewardTypeRegistry],
})
export class RewardsModule {}
