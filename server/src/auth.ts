import {
  Body, CanActivate, Controller, ExecutionContext, Get, Injectable,
  Module, Post, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from './database';

class LoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.omjd_session;
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar.');
    try {
      request.admin = verifyToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('La sesión venció. Vuelve a iniciar sesión.');
    }
  }
}

@Injectable()
class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async login(username: string, password: string) {
    const result = await this.db.query('SELECT id, username, password_hash FROM admin_users WHERE username = $1', [username.trim()]);
    const admin = result.rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }
    return createToken(admin.id, admin.username);
  }
}

function createToken(sub: number, username: string) {
  const secret = process.env.JWT_SECRET!;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, username, exp: Math.floor(Date.now() / 1000) + 43_200 })).toString('base64url');
  const content = `${header}.${payload}`;
  return `${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
}

function verifyToken(token: string) {
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra) throw new Error('Invalid token');
  const content = `${header}.${payload}`;
  const expected = createHmac('sha256', process.env.JWT_SECRET!).update(content).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid signature');
  const metadata = JSON.parse(Buffer.from(header, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (metadata.alg !== 'HS256' || !Number.isInteger(claims.sub) || typeof claims.username !== 'string' ||
      !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
    throw new Error('Invalid claims');
  }
  return claims as { sub: number; username: string };
}

const cookieOptions = (secure: boolean) => ({
  httpOnly: true as const,
  secure,
  sameSite: 'strict' as const,
  path: '/api',
  maxAge: 12 * 60 * 60 * 1000,
});

@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const token = await this.auth.login(body.username, body.password);
    response.cookie('omjd_session', token, cookieOptions(process.env.NODE_ENV === 'production'));
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('omjd_session', cookieOptions(process.env.NODE_ENV === 'production'));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() request: Request) {
    return { username: request.admin!.username };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard, ThrottlerGuard],
  exports: [AdminGuard],
})
export class AuthModule {}

export const authThrottlerGuard = ThrottlerGuard;

declare module 'express-serve-static-core' {
  interface Request {
    admin?: { sub: number; username: string };
  }
}
