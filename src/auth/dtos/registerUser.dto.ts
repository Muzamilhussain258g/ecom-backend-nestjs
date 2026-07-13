import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterUserDto {
    @Transform(({ value }) => value.trim())
    @IsNotEmpty()
    @IsString()
    name!: string

    @Transform(({ value }) => value.trim())
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(6)
    password!: string;
}