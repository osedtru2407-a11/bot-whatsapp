import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('rules')
export class Rule {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'company_id', type: 'varchar', length: 100 })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'parent_rule_id', type: 'varchar', length: 100, nullable: true })
  parentRuleId: string;

  @Column({ name: 'trigger_type', type: 'varchar', length: 50, default: 'text' })
  triggerType: string;

  @Column({ name: 'match_type', type: 'varchar', length: 50 })
  matchType: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  triggers: string[];

  @Column({ type: 'text' })
  response: string;

  @Column({ type: 'jsonb', nullable: true })
  media: any;

  @Column({ name: 'lead_tag', type: 'varchar', length: 100, nullable: true })
  leadTag: string;

  @Column({ name: 'pause_bot', type: 'boolean', default: false })
  pauseBot: boolean;

  @Column({ name: 'media_type_filter', type: 'varchar', length: 50, default: 'any' })
  mediaTypeFilter: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}

