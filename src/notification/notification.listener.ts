import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from './email.service';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { Comment, Prisma } from '@prisma/client';
import { PushService } from './push.service';

@Injectable()
export class NotificationListener {
  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
    private readonly expoPush: PushService,
  ) {}

  @OnEvent('comment.created')
  async handleCommentCreatedEvent(payload: {
    comment: Comment;
    postId: string;
    userId: string;
  }) {
    const { comment } = payload;

    const post = await this.prisma.post.findUnique({
      where: { id: payload.postId },
      include: {
        comments: {
          include: {
            user: {
              include: {
                PushToken: true,
              },
            },
          },
        },
        user: {
          include: {
            PushToken: true,
          },
        },
      },
    });

    const commentUsers = post!.comments.map((c) => c.user);

    const author = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        PushToken: true,
      },
    });

    const recipients = [...commentUsers, author!];

    await this.emailService.sendCommentNotification(comment, post!, recipients);

    await this.expoPush.sendPushToUsers(recipients, {
      title: `Novo comentário`,
      body: `${author?.name ?? 'Alguém'} comentou: "${comment.content}"`,
      data: {
        type: 'COMMENT',
        postId: post!.id,
      },
    });
  }

  @OnEvent('password.reset')
  async handlePasswordResetEvent(payload: {
    email: string;
    resetPasswordCode: string;
  }) {
    const { email, resetPasswordCode } = payload;

    await this.emailService.sendPasswordRecovery(email, resetPasswordCode);
  }

  @OnEvent('face.detected')
  async handleFaceDetected(
    entity: Prisma.EntityGetPayload<{
      include: {
        media: {
          include: {
            post: {
              include: {
                user: {
                  include: { PushToken: true };
                };
              };
            };
          };
        };
        EntityCluster: { include: { user: { include: { PushToken: true } } } };
      };
    }>,
  ) {
    const userEmail = entity.EntityCluster!.user!.email;
    const targetUser = entity.EntityCluster!.user!;

    const post = entity.media.post;
    const user = entity.media.post.user;
    const media = entity.media;

    await this.emailService.sendFaceDetected(userEmail, post, user, media);

    await this.expoPush.sendPushToUsers([targetUser], {
      title: `Você apareceu em uma foto`,
      body: `${user.name} te marcou em uma imagem`,
      data: {
        type: 'FACE_DETECTED',
        postId: post.id,
        mediaId: media.id,
      },
    });
  }
}
