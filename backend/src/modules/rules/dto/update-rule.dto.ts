import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  parentRuleId?: string;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  @IsString()
  matchType?: string;

  @IsOptional()
  @IsArray()
  triggers?: string[];

  @IsOptional()
  @IsString()
  response?: string;

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
