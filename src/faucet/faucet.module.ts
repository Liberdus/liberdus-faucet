import { Module } from '@nestjs/common';
import { FaucetController } from './faucet.controller';
import { FaucetService } from './faucet.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [BlockchainModule, StatsModule],
  controllers: [FaucetController],
  providers: [FaucetService],
  exports: [FaucetService],
})
export class FaucetModule {}
