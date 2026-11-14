import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @ApiPropertyOptional({ description: 'School code. Empty for publisher staff.' })
  @IsOptional() @IsString() @MaxLength(40) schoolCode?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) username: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) password: string;
}
export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(200) currentPassword: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) @MaxLength(200) newPassword: string;
}
