import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/databases/prisma/prisma.service';

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async likePost(postId: string, userId: string) {
    try {
      const like = await this.prisma.like.create({
        data: { userId, postId },
      });

      this.eventEmitter.emit('post.liked', {
        postId,
        userId,
      });

      return like;
    } catch (error) {
      if (error.code === 'P2002') {
        return this.prisma.like.findUnique({
          where: { userId_postId: { userId, postId } },
        });
      }
      throw error;
    }
  }

  async unlikePost(postId: string, userId: string) {
    return this.prisma.like.delete({
      where: {
        userId_postId: { userId, postId },
      },
    });
  }

  async liked(postId: string, userId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
    });

    return like;
  }
}
