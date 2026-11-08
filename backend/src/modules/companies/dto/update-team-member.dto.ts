import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTeamMemberDto {
  @IsNotEmpty({ message: 'El ID del nuevo rol es obligatorio' })
  @IsString()
  roleId: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

