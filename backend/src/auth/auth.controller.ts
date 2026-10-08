import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

class CredsDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}
class RefreshDto {
  @IsString() refreshToken: string;
}

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register') register(@Body() b: CredsDto) { return this.auth.register(b.email, b.password); }
  @Post('login') @HttpCode(200) login(@Body() b: CredsDto) { return this.auth.login(b.email, b.password); }
  @Post('refresh') @HttpCode(200) refresh(@Body() b: RefreshDto) { return this.auth.refresh(b.refreshToken); }
  @Post('logout') @HttpCode(204) @UseGuards(JwtGuard) async logout(@Req() req: any) { await this.auth.logout(req.user.id); }
}
