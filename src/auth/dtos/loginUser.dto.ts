import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class LoginUserDto {
    @Transform(({ value }) => value.trim())
    @IsNotEmpty()
    @IsEmail()
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password!: string;
}