import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  userEmail: string;

  @Column()
  action: string; // e.g. 'LOGIN', 'LOGOUT', 'VALVE_CLOSE', 'USER_CREATE'

  @Column({ type: 'text', nullable: true })
  details: string; // JSON or text details of the action

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  organizationId: string; // To allow filtering logs by tenant in multi-tenant environments

  @CreateDateColumn()
  createdAt: Date;
}
