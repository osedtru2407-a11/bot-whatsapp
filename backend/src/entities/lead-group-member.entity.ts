import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Company } from './company.entity';
import { ContactGroup } from './contact-group.entity';

@Entity('lead_group_members')
@Unique(['groupId', 'leadPhone'])
export class LeadGroupMember {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'company_id', type: 'varchar', length: 100 })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'group_id', type: 'varchar', length: 100 })
  groupId: string;

  @ManyToOne(() => ContactGroup, (g) => g.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: ContactGroup;

  @Column({ name: 'lead_phone', type: 'varchar', length: 100 })
  leadPhone: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}

