import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddTeamMemberDto {
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @IsEmail({}, { message: 'El formato de correo es inválido' })
  email: string;

  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  @IsString()
  fullName: string;

  @IsNotEmpty({ message: 'El rol es obligatorio' })
  @IsString()
  roleId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  temporaryPassword?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

