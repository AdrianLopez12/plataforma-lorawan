import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Device } from '../devices/device.entity';

@Entity('telemetry')
@Index(['devEUI', 'receivedAt'])
export class TelemetryRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 16 })
  @Index()
  devEUI: string;

  @ManyToOne(() => Device, (d) => d.telemetry, { nullable: true })
  @JoinColumn({ name: 'devEUI', referencedColumnName: 'devEUI' })
  device: Device;

  // Datos LoRaWAN
  @Column({ nullable: true })
  fPort: number;

  @Column({ nullable: true })
  fCnt: number;

  @Column({ nullable: true })
  spreadingFactor: number;

  @Column({ type: 'float', nullable: true })
  rssi: number;

  @Column({ type: 'float', nullable: true })
  snr: number;

  // Payload crudo en base64 tal como llega de Tektelic
  @Column({ nullable: true, type: 'text' })
  rawPayload: string;

  // Payload ya decodificado como JSON
  @Column({ type: 'jsonb', nullable: true })
  decodedPayload: Record<string, any> | null;

  // Payload completo original de Tektelic (para auditoría)
  @Column({ type: 'jsonb', nullable: true })
  rawMessage: Record<string, any>;

  @Column({ nullable: true })
  gatewayId: string;

  @Column({ nullable: true })
  integrationId: string;

  @CreateDateColumn()
  receivedAt: Date;
}
