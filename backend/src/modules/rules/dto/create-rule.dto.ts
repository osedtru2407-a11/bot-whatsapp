import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRuleDto {
  @IsNotEmpty({ message: 'El nombre de la regla es obligatorio' })
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  parentRuleId?: string;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsNotEmpty({ message: 'El tipo de coincidencia es obligatorio' })
  @IsString()
  matchType: string;

  @IsArray({ message: 'Los disparadores deben ser un arreglo de palabras' })
  triggers: string[];

  @IsNotEmpty({ message: 'La respuesta es obligatoria' })
  @IsString()
  response: string;

  @IsOptional()
  media?: any;

  @IsOptional()
  @IsString()
  leadTag?: string;

  @IsOptional()
  @IsBoolean()
  pauseBot?: boolean;

  @IsOptional()
  @IsString()
  mediaTypeFilter?: string;
}

