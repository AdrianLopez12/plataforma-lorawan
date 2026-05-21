import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from './integration.entity';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Integration])],
  providers: [IntegrationService],
  controllers: [IntegrationController],
  exports: [IntegrationService, TypeOrmModule],
})
export class IntegrationModule {}
