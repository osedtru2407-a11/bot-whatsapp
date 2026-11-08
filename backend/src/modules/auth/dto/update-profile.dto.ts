import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @IsNotEmpty({ message: 'El nombre completo no puede estar vacío' })
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

