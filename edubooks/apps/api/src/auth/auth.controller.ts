import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public, Ctx } from '../common/decorators';
import { config } from '../config';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { SESSION_COOKIE } from './auth.guard';
import { RETURN_COOKIE } from './login-as.controller';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: Number(process.env.LOGIN_RATE_LIMIT || 60), ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.login(dto.schoolCode, dto.username, dto.password, req.ip, req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', expires: expiresAt });
    return { ok: true };
  }

  @Post('logout') @HttpCode(200)
  async logout(@Ctx() ctx: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx);
    res.clearCookie(SESSION_COOKIE, { path: '/' }); res.clearCookie(RETURN_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: any) {
    const m = req.me;
    return {
      id: m.user_id, username: m.username, displayName: m.display_name, roles: m.roles, mustChangePassword: m.impersonator_id ? false : m.must_change_password,
      impersonatedBy: m.impersonator_id ? { id: m.impersonator_id, name: m.impersonator_name } : null,
      publisherId: m.publisher_id, school: m.school_id ? { id: m.school_id, name: m.school_name, code: m.school_code } : null,
    };
  }

  @Post('change-password') @HttpCode(200)
  async changePassword(@Ctx() ctx: any, @Body() dto: ChangePasswordDto) {
    if (ctx.impersonatorId) throw new ForbiddenException('You are signed in as this person. Their password can only be changed by them, or reset by their school admin.');
    await this.auth.changePassword(ctx, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
