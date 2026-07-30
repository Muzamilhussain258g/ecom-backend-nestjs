import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class LoginUserDto {
    @Transform(({ value }) => value.trim())
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(6)
    password!: string;
}