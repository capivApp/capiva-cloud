import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, User } from "@prisma-generated/client";

@Injectable()
export class UserRepository extends BaseRepository {
  findByEmail(email: string): Promise<User | null> {
    return this.tx.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.tx.user.findUnique({ where: { id } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.tx.user.create({ data });
  }
}
