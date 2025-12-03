import { IsString, IsNotEmpty, ValidateNested, IsOptional } from 'class-validator';
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
  @IsOptional()
  nodeAddress?: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  userAddress: string;

  @IsString()
  @IsNotEmpty()
  networkId: string;

  @ValidateNested()
  @Type(() => SignatureDto)
  sign: SignatureDto;
}
