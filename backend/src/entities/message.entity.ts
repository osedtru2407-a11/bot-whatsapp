import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('messages')
export class Message {
  @PrimaryColumn({ type: 'varchar', length: 150 })
  id: string;

  @Column({ name: 'company_id', type: 'varchar', length: 100 })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 100 })
  phone: string;

  @Column({ name: 'from_me', type: 'boolean', default: false })
  fromMe: boolean;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl: string;

  @Column({ name: 'media_mimetype', type: 'varchar', length: 100, nullable: true })
  mediaMimetype: string;

  @Column({ name: 'message_type', type: 'varchar', length: 50, default: 'chat' })
  messageType: string;

  @CreateDateColumn({ name: 'timestamp', type: 'timestamptz', default: () => 'NOW()' })
  timestamp: Date;
}

