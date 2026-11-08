import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { CompanyUser } from '../../entities/company-user.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Role } from '../../entities/role.entity';
import { PasswordReset } from '../../entities/password-reset.entity';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Company,
            CompanyUser,
            CompanySetting,
            Role,
            PasswordReset,
        ]),
        MailModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            useFactory: () => ({
                secret:
                    process.env.JWT_SECRET ||
                    'ws_sales_bot_jwt_secret_key_2026_super_secure',
                signOptions: { expiresIn: '7d' },
            }),
        }),
    ],
    providers: [AuthService, JwtStrategy],
    controllers: [AuthController],
    exports: [AuthService, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
