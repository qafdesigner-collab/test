import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { runMigrations } from '../src/db/migrate';
import { seed } from '../src/db/seed';

export async function createApp() {
  await runMigrations();
  await seed(undefined, { reset: true, quiet: true });
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(mod.createNestApplication());
  await app.init();
  return app;
}
export async function login(app: INestApplication, username: string, password: string, schoolCode?: string) {
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post('/api/auth/login').send({ username, password, schoolCode });
  if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return agent;
}
export const ownerPool = () => new Pool({ connectionString: process.env.DATABASE_OWNER_URL });
export const appPool = () => new Pool({ connectionString: process.env.DATABASE_URL });
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
