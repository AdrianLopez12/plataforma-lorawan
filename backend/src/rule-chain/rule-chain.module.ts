import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuleChain } from './rule-chain.entity';
import { RuleChainService } from './rule-chain.service';
import { RuleEngineExecutorService } from './rule-engine-executor.service';
import { RuleChainsController } from './rule-chains.controller';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { DevicesModule } from '../devices/devices.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RuleChain]),
    TelemetryModule,
    DevicesModule,
  ],
  controllers: [RuleChainsController],
  providers: [RuleChainService, RuleEngineExecutorService],
  exports: [RuleChainService, RuleEngineExecutorService],
})
export class RuleChainModule {}
