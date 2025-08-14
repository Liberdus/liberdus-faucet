import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FaucetModule } from './faucet/faucet.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [FaucetModule, BlockchainModule, StatsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
