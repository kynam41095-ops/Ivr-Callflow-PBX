import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('service-health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health trả 200 với status "ok"', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('GET /health không đòi tham số hay xác thực', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['www-authenticate']).toBeUndefined();
  });

  it('đường dẫn chưa khai báo trả 404', async () => {
    await request(app.getHttpServer()).get('/khong-ton-tai').expect(404);
  });

  it('GET / không còn trả "Hello World!" của scaffold', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(404);
  });
});
