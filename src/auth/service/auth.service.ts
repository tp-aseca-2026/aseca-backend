import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { PublicUser, User } from '../../users/domain/user.entity';
import { UsersRepository } from '../../users/repository/users.repository';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import type { AuthToken } from '../domain/auth-token';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const email = this.normalizeEmail(dto.email);

    await this.ensureEmailIsAvailable(email);

    const passwordHash = await this.hashPassword(dto.password);

    return this.createUser(email, passwordHash);
  }

  async login(dto: LoginDto): Promise<AuthToken> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.getUserOrFail(email);

    await this.ensurePasswordIsValid(dto.password, user.passwordHash);

    return this.generateAccessToken(user);
  }

  private async ensureEmailIsAvailable(email: string): Promise<void> {
    const existingUser = await this.usersRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }
  }

  private async createUser(
    email: string,
    passwordHash: string,
  ): Promise<PublicUser> {
    return this.usersRepository.create({
      email,
      passwordHash,
    });
  }

  private async getUserOrFail(email: string): Promise<User> {
    const user = await this.usersRepository.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private async ensurePasswordIsValid(
    plainPassword: string,
    passwordHash: string,
  ): Promise<void> {
    const passwordMatches = await bcrypt.compare(plainPassword, passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  private async generateAccessToken(user: User): Promise<AuthToken> {
    return {
      accessToken: await this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
      }),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
