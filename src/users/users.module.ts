import { Module } from '@nestjs/common';
import { UsersRepository } from './repository/users.repository';

@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
