import { LoginAsController } from './login-as.controller';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
@Module({ controllers: [AuthController, LoginAsController], providers: [AuthService] })
export class AuthModule {}
