import { IsEmail, IsString, MinLength } from "class-validator";

export class CredsDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}