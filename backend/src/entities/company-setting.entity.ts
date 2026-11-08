import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('company_settings')
export class CompanySetting {
  @PrimaryColumn({ name: 'company_id', type: 'varchar', length: 100 })
  companyId: string;

  @OneToOne(() => Company, (company) => company.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'business_name', type: 'varchar', length: 255, nullable: true })
  businessName: string;

  @Column({ name: 'bot_enabled', type: 'boolean', default: true })
  botEnabled: boolean;

  @Column({ name: 'simulate_typing', type: 'boolean', default: true })
  simulateTyping: boolean;

  @Column({ name: 'typing_delay_seconds', type: 'int', default: 2 })
  typingDelaySeconds: number;

  @Column({ name: 'ignore_groups', type: 'boolean', default: true })
  ignoreGroups: boolean;

  @Column({ name: 'fallback_message', type: 'text', nullable: true })
  fallbackMessage: string;

  @Column({ name: 'gemini_enabled', type: 'boolean', default: true })
  geminiEnabled: boolean;

  @Column({ name: 'gemini_api_key', type: 'text', nullable: true })
  geminiApiKey: string;

  @Column({ name: 'gemini_model', type: 'varchar', length: 100, default: 'gemini-3.5-flash-lite' })
  geminiModel: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}

