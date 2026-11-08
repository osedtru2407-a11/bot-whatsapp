import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  @IsString()
  name: string;
}

