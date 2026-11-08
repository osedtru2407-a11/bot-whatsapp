import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';

@Entity('password_resets')
export class PasswordReset {
    @PrimaryColumn({ type: 'varchar', length: 100 })
    id: string;

    @Index()
    @Column({ type: 'varchar', length: 255 })
    email: string;

    @Index()
    @Column({ type: 'varchar', length: 255 })
    token: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    code: string;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date;

    @Column({ type: 'boolean', default: false })
    used: boolean;

    @CreateDateColumn({
        name: 'created_at',
        type: 'timestamptz',
        default: () => 'NOW()',
    })
    createdAt: Date;
}
