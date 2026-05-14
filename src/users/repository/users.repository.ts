import { Injectable } from '@nestjs/common';
import { User, PublicUser } from '../domain/user.entity';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findPublicById(id: number): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async create(input: {
    email: string;
    passwordHash: string;
  }): Promise<PublicUser> {
    return this.prisma.user.create({
      data: input,
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });
  }
}
