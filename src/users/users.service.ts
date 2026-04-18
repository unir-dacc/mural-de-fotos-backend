import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserSchema } from './dto/create-user.dto';
import { UpdateUserSchema } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { createPaginator } from 'prisma-pagination';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'crypto';
import * as dayjs from 'dayjs';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createUser(createUserDto: CreateUserDto) {
    const parsedDto = CreateUserSchema.parse(createUserDto);
    const hashedPassword = await bcrypt.hash(parsedDto.password, 10);

    const checkEmailAndCpf = await this.prisma.user.findMany({
      where: {
        OR: [{ email: parsedDto.email, cpf: parsedDto.cpf }],
      },
    });

    if (checkEmailAndCpf.length > 0) {
      throw new ConflictException('Email or CPF already in use');
    }

    const user = await this.prisma.user.create({
      data: {
        ...parsedDto,
        password: hashedPassword,
        email: parsedDto.email,
      },
      omit: {
        password: true,
      },
    });

    return user;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
        comments: {
          include: {
            post: true,
          },
        },
        likes: {
          include: {
            post: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [totalLikes, totalComments, totalPosts] = await Promise.all([
      this.prisma.like.count({
        where: {
          post: {
            userId: id,
          },
        },
      }),
      this.prisma.comment.count({
        where: {
          post: {
            userId: id,
          },
        },
      }),
      this.prisma.post.count({
        where: {
          userId: id,
        },
      }),
    ]);

    return {
      ...user,
      totalLikes,
      totalComments,
      totalPosts,
    };
  }

  async findAll(query: any) {
    const {
      page = 1,
      limit = 10,
      orderBy = 'createdAt',
      order = 'desc',
    } = query;

    const paginate = createPaginator({ page, perPage: limit });

    const orderByClause = { [orderBy]: order };

    const queryResult = await paginate<any, any>(this.prisma.user, {
      where: {
        name: { contains: query.name, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
      orderBy: orderByClause,
    });

    return queryResult;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const parsedDto = UpdateUserSchema.parse(updateUserDto);

    const data: any = { ...parsedDto };

    if (parsedDto.password) {
      data.password = await bcrypt.hash(parsedDto.password, 10);
    }

    delete data.token;
    delete data.platform;

    if (parsedDto.token && parsedDto.platform) {
      data.PushToken = {
        connectOrCreate: {
          where: {
            token: parsedDto.token,
          },
          create: {
            token: parsedDto.token,
            platform: parsedDto.platform,
          },
        },
      };
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      omit: {
        cpf: true,
        password: true,
      },
    });

    return user;
  }

  async remove(id: string) {
    const user = await this.prisma.user.delete({
      where: { id },
    });
    return user;
  }

  async recoverPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return;
    }

    const resetPasswordCode = String(randomInt(100000, 999999));
    const resetPasswordCodeExpiry = dayjs().add(1, 'hour').toDate();

    await this.prisma.user.update({
      where: { email },
      data: {
        resetPasswordCode,
        resetPasswordCodeExpiry,
      },
    });

    this.eventEmitter.emit('password.reset', {
      email: user.email,
      resetPasswordCode,
    });

    return;
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (user?.resetPasswordCode !== code) throw new UnauthorizedException();

    if (!user) {
      throw new NotFoundException('Invalid or expired reset code');
    }

    if (
      !user.resetPasswordCodeExpiry ||
      user.resetPasswordCodeExpiry < new Date()
    ) {
      throw new ConflictException('Reset code expired');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordCode: null,
        resetPasswordCodeExpiry: null,
      },
    });

    return;
  }
}
