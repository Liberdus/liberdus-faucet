import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SignatureDto {
  @IsString()
  @IsNotEmpty()
  owner: string;

  @IsString()
  @IsNotEmpty()
  sig: string;
}

export class FaucetRequestDto {
  @IsString()
  @IsNotEmpty()
  nodeAddress: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  userAddress: string;

  @ValidateNested()
  @Type(() => SignatureDto)
  sign: SignatureDto;
}
