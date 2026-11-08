import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { CompanyUser } from './company-user.entity';
import { Role } from './role.entity';
import { CompanySetting } from './company-setting.entity';

@Entity('companies')
export class Company {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;

  @OneToOne(() => CompanySetting, (setting) => setting.company)
  settings: CompanySetting;

  @OneToMany(() => CompanyUser, (cu) => cu.company)
  users: CompanyUser[];

  @OneToMany(() => Role, (role) => role.company)
  roles: Role[];
}

