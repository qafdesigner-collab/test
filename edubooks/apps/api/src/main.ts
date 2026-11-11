import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded, NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { config } from './config';
import { JsonLogger } from './common/json-logger';

/** Security headers for an API that only serves JSON and signed files. */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Access log with a request id (propagated from the proxy if present). No bodies, no query strings with secrets. */
function accessLog(req: Request & { ctx?: any }, res: Response, next: NextFunction) {
  const id = String(req.headers['x-request-id'] ?? randomUUID()).slice(0, 64);
  res.setHeader('X-Request-Id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path.startsWith('/api/health')) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const path = req.path.replace(/\/files\/[^/]+/, '/files/:token');
    Logger.log({ msg: 'request', requestId: id, method: req.method, path, status: res.statusCode, ms: Math.round(ms), user: req.ctx?.userId, school: req.ctx?.schoolId }, 'HTTP');
  });
  next();
}

export function configureApp(app: INestApplication) {
  const ex = app as NestExpressApplication;
  ex.set('trust proxy', 1);
  ex.disable('x-powered-by');
  ex.use(json({ limit: '2mb' }));
  ex.use(urlencoded({ extended: false, limit: '100kb' }));
  ex.use(securityHeaders);
  if (process.env.NODE_ENV !== 'test') ex.use(accessLog);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  if (config.apiDocs) {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('EduBooks LMS API').setVersion('1.0').addCookieAuth('eb_session').build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  return app;
}

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule, { bodyParser: false, logger: config.logFormat === 'json' ? new JsonLogger() : undefined }));
  await app.listen(config.port);
  Logger.log(`EduBooks API listening on :${config.port}${config.apiDocs ? ' (docs: /api/docs)' : ''}`, 'Bootstrap');
}
if (require.main === module) bootstrap();
