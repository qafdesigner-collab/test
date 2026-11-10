import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './config';

export function configureApp(app: INestApplication) {
  const ex = app as NestExpressApplication;
  ex.set('trust proxy', 1);
  ex.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('EduBooks LMS API').setVersion('0.1')
    .addCookieAuth('eb_session').build());
  SwaggerModule.setup('api/docs', app, doc);
  return app;
}

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule, { bodyParser: true }));
  await app.listen(config.port);
  console.log(`📚 EduBooks API on http://localhost:${config.port}/api  (docs: /api/docs)`);
}
if (require.main === module) bootstrap();
