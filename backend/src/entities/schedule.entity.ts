import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('schedules')
export class Schedule {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'company_id', type: 'varchar', length: 100 })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  recipient: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  media: any;

  @Column({ name: 'scheduled_time', type: 'timestamptz' })
  scheduledTime: Date;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ name: 'target_type', type: 'varchar', length: 50, default: 'single' })
  targetType: string;

  @Column({ name: 'target_value', type: 'varchar', length: 255, nullable: true })
  targetValue: string;

  @Column({ name: 'total_recipients', type: 'int', default: 1 })
  totalRecipients: number;

  @Column({ name: 'sent_recipients', type: 'int', default: 0 })
  sentRecipients: number;

  @Column({ name: 'failed_recipients', type: 'int', default: 0 })
  failedRecipients: number;

  @Column({ name: 'delay_seconds', type: 'int', default: 10 })
  delaySeconds: number;

  @Column({ name: 'execution_logs', type: 'jsonb', default: () => "'[]'::jsonb" })
  executionLogs: any[];

  @Column({ type: 'varchar', length: 50, default: 'none' })
  recurrence: string;

  @Column({ name: 'last_sent_at', type: 'timestamptz', nullable: true })
  lastSentAt: Date;
}

