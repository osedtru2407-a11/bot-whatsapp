import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('leads')
@Unique(['companyId', 'phone'])
export class Lead {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'company_id', type: 'varchar', length: 100 })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 100 })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 100, default: 'Nuevo' })
  tag: string;

  @Column({ name: 'last_message', type: 'text', nullable: true })
  lastMessage: string;

  @Column({ name: 'last_sent_rule_id', type: 'varchar', length: 100, nullable: true })
  lastSentRuleId: string;

  @Column({ name: 'human_paused', type: 'boolean', default: false })
  humanPaused: boolean;

  @Column({ name: 'received_files', type: 'jsonb', default: () => "'[]'::jsonb" })
  receivedFiles: any[];

  @Column({ name: 'last_interaction', type: 'timestamptz', default: () => 'NOW()' })
  lastInteraction: Date;
}

