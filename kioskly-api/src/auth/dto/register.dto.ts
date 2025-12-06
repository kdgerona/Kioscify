import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength, IsEnum } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'johndoe' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: ['ADMIN', 'CASHIER'], example: 'CASHIER' })
  @IsEnum(['ADMIN', 'CASHIER'])
  role: 'ADMIN' | 'CASHIER';
}
