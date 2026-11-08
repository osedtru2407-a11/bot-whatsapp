import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio' })
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray({ message: 'Los permisos deben ser una lista de strings' })
  permissions: string[];
}

