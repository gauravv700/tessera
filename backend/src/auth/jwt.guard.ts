import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const p = await this.jwt.verifyAsync(token);
      if (p.typ !== 'access') throw new Error('wrong token type');
      req.user = { id: p.sub as string };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
