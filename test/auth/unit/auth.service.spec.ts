import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../../../src/users/repository/users.repository';
import { AuthService } from '../../../src/auth/service/auth.service';



describe('AuthService', () => {
  let authService: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersRepository,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    usersRepository = moduleRef.get(UsersRepository);
    jwtService = moduleRef.get(JwtService);
  });

  describe('register', () => {
    it('creates a user with normalized email and hashed password', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue({
        id: 1,
        email: 'test@mail.com',
        createdAt: new Date(),
      });

      const result = await authService.register({
        email: ' Test@Mail.com ',
        password: '12345678',
      });

      expect(usersRepository.findByEmail).toHaveBeenCalledWith('test@mail.com');
      expect(usersRepository.create).toHaveBeenCalledWith({
        email: 'test@mail.com',
        passwordHash: expect.any(String),
      });

      const createdInput = usersRepository.create.mock.calls[0][0];
      const passwordMatches = await bcrypt.compare(
        '12345678',
        createdInput.passwordHash,
      );

      expect(passwordMatches).toBe(true);
      expect(result.email).toBe('test@mail.com');
    });

    it('throws ConflictException when email already exists', async () => {
      usersRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@mail.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authService.register({
          email: 'test@mail.com',
          password: '12345678',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns an access token when credentials are valid', async () => {
      const passwordHash = await bcrypt.hash('12345678', 10);

      usersRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@mail.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await authService.login({
        email: 'TEST@mail.com',
        password: '12345678',
      });

      expect(usersRepository.findByEmail).toHaveBeenCalledWith('test@mail.com');
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 1,
        email: 'test@mail.com',
      });
      expect(result).toEqual({
        accessToken: 'jwt-token',
      });
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'missing@mail.com',
          password: '12345678',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when password is invalid', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);

      usersRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@mail.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authService.login({
          email: 'test@mail.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
