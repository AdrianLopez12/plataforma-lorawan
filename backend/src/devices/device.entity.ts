import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { TelemetryRecord } from '../telemetry/telemetry.entity';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 16 })
  devEUI: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  deviceType: string;

  @Column({ nullable: true })
  applicationId: string;

  @Column({ nullable: false })
  integrationId: string;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  @Index()
  organizationId: string;

  @Column({ default: true })
  valveOpen: boolean;

  @Column({ nullable: true, type: 'text' })
  codecJs: string;

  @Column({ type: 'float', nullable: true })
  lat: number;

  @Column({ type: 'float', nullable: true })
  lng: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TelemetryRecord, (t) => t.device)
  telemetry: TelemetryRecord[];
}
