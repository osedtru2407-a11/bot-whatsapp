import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  media?: {
    url: string;
    mimetype?: string;
    filename?: string;
  };

  @IsOptional()
  @IsString()
  companyId?: string;
}

