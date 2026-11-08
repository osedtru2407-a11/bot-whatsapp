import { IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class ResetPasswordDto {
    @IsOptional()
    email?: string;

    @IsOptional()
    code?: string;

    @IsOptional()
    token?: string;

    @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
    @MinLength(6, {
        message: 'La nueva contraseña debe tener al menos 6 caracteres',
    })
    newPassword: string;
}
