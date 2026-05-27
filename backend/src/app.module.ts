import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './devices/device.entity';
import { TelemetryRecord } from './telemetry/telemetry.entity';
import { Integration } from './integration/integration.entity';
import { User } from './users/user.entity';
import { Organization } from './organization/organization.entity';
import { AuditLog } from './common/audit-log.entity';
import { RuleChain } from './rule-chain/rule-chain.entity';
import { DevicesModule } from './devices/devices.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { WebhookModule } from './webhook/webhook.module';
import { IntegrationModule } from './integration/integration.module';
import { AuthModule } from './auth/auth.module';
import { AuditLogModule } from './common/audit-log.module';
import { RuleChainModule } from './rule-chain/rule-chain.module';
import { ExternalApiModule } from './external-api/external-api.module';

@Module({
  imports: [
    // Carga el .env automáticamente
    ConfigModule.forRoot({ isGlobal: true }),

    // Conexión a PostgreSQL usando las variables de entorno
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5433),
        username: config.get<string>('DB_USER', 'appuser'),
        password: config.get<string>('DB_PASS', 'apppass123'),
        database: config.get<string>('DB_NAME', 'lorawan_app'),
        entities: [Device, TelemetryRecord, Integration, User, Organization, AuditLog, RuleChain],
        // synchronize:true crea las tablas automáticamente en desarrollo
        // Cámbialo a false en producción y usa migraciones
        synchronize: true,
        logging: config.get('NODE_ENV') !== 'production',
      }),
    }),

    AuditLogModule,
    DevicesModule,
    TelemetryModule,
    WebhookModule,
    IntegrationModule,
    AuthModule,
    RuleChainModule,
    ExternalApiModule,
  ],
})
export class AppModule {}
