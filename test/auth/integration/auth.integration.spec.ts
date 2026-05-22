import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/database/prisma.service';

const TEST_EMAIL = 'auth-integration@example.com';
const TEST_PASSWORD = 'ValidPass1';

type RegisterResponse = {
  id: number;
  email: string;
  createdAt: string;
};

type LoginResponse = {
  accessToken: string;
};

type MeResponse = {
  id: number;
  email: string;
};

async function cleanTestUsers(prisma: PrismaService): Promise<void> {
  await prisma.user.deleteMany({
    where: { email: { contains: 'auth-integration' } },
  });
}

describe('Auth (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await cleanTestUsers(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestUsers(prisma);
  });

  describe('POST /auth/register', () => {
    it('returns 201 with id, email and createdAt on success', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const body = res.body as RegisterResponse;

      expect(typeof body.id).toBe('number');
      expect(body.email).toBe(TEST_EMAIL);
      expect(typeof body.createdAt).toBe('string');
    });

    it('does not expose passwordHash in the response', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('persists the user in the database', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const saved = await prisma.user.findUnique({
        where: { email: TEST_EMAIL },
      });

      expect(saved).not.toBeNull();

      if (saved === null) {
        throw new Error('Expected user to be saved');
      }

      expect(saved.email).toBe(TEST_EMAIL);
    });

    it('normalizes email to lowercase before saving', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'AUTH-Integration@EXAMPLE.com',
          password: TEST_PASSWORD,
        })
        .expect(201);

      const body = res.body as RegisterResponse;

      expect(body.email).toBe('auth-integration@example.com');
    });

    it('returns 409 when the email is already registered', async () => {
      await prisma.user.create({
        data: { email: TEST_EMAIL, passwordHash: 'irrelevant-hash' },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(409);
    });

    it('returns 409 when email already exists in different casing', async () => {
      await prisma.user.create({
        data: { email: TEST_EMAIL, passwordHash: 'irrelevant-hash' },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL.toUpperCase(), password: TEST_PASSWORD })
        .expect(409);
    });

    it('does not create a duplicate row when 409 is returned', async () => {
      await prisma.user.create({
        data: { email: TEST_EMAIL, passwordHash: 'irrelevant-hash' },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(409);

      const count = await prisma.user.count({ where: { email: TEST_EMAIL } });

      expect(count).toBe(1);
    });

    it('returns 400 when email has invalid format', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: TEST_PASSWORD })
        .expect(400);
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: 'short' })
        .expect(400);
    });

    it('returns 400 when password field is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL })
        .expect(400);
    });

    it('returns 400 when email field is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ password: TEST_PASSWORD })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    });

    it('returns 200 with an accessToken on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const body = res.body as LoginResponse;

      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);
    });

    it('accessToken has JWT format (three dot-separated segments)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const body = res.body as LoginResponse;
      const parts = body.accessToken.split('.');

      expect(parts).toHaveLength(3);
    });

    it('allows login with email in different casing', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL.toUpperCase(), password: TEST_PASSWORD })
        .expect(201);

      const body = res.body as LoginResponse;

      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);
    });

    it('returns 401 when the user does not exist', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: TEST_PASSWORD })
        .expect(401);
    });

    it('returns 401 when the password is wrong', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: 'WrongPass1' })
        .expect(401);
    });

    it('returns 400 when email has invalid format', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: TEST_PASSWORD })
        .expect(400);
    });

    it('returns 400 when email field is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(400);
    });

    it('returns 400 when password field is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 200 with id and email when the token is valid', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const registerBody = registerRes.body as RegisterResponse;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const loginBody = loginRes.body as LoginResponse;

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .expect(200);

      const body = res.body as MeResponse;

      expect(body.id).toBe(registerBody.id);
      expect(body.email).toBe(TEST_EMAIL);
    });

    it('does not expose passwordHash in GET /auth/me response', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const loginBody = loginRes.body as LoginResponse;

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('returns 401 when Authorization header is absent', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('returns 401 when the token is malformed', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer this.is.not.a.valid.jwt')
        .expect(401);
    });

    it('returns 401 when the token has an invalid signature', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set(
          'Authorization',
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.invalidsignature',
        )
        .expect(401);
    });
  });
});
