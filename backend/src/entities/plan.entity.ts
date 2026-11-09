import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0.0 })
  price: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'gemini_limit_type', type: 'varchar', length: 50, default: 'monthly' })
  geminiLimitType: string; // 'monthly' | 'total'

  @Column({ name: 'gemini_limit', type: 'int', default: 100 })
  geminiLimit: number; // -1 = ilimitado

  @Column({ name: 'auto_messages_limit_type', type: 'varchar', length: 50, default: 'monthly' })
  autoMessagesLimitType: string; // 'monthly' | 'total' | 'unlimited'

  @Column({ name: 'auto_messages_limit', type: 'int', default: 500 })
  autoMessagesLimit: number; // -1 = ilimitado

  @Column({ name: 'custom_warning_message', type: 'text', nullable: true })
  customWarningMessage: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}

