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
    const { comment, postId, userId } = payload;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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

    if (!post) return;

    const commentUsers = post.comments.map((c) => c.user);

    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        PushToken: true,
      },
    });

    if (!author) return;

    const recipientsMap = new Map<string, typeof author>();

    [...commentUsers, post.user].forEach((u) => {
      if (u.id !== userId) {
        recipientsMap.set(u.id, u);
      }
    });

    const recipients = Array.from(recipientsMap.values());

    if (recipients.length === 0) return;

    await this.emailService.sendCommentNotification(comment, post, recipients);

    await this.expoPush.sendPushToUsers(recipients, {
      title: 'Novo comentário',
      body: `${author.name ?? 'Alguém'} comentou: "${comment.content}"`,
      sound: 'default',
      categoryId: 'post_notification',
      data: {
        type: 'comment',
        postId: post.id,
      },
    });
  }

  @OnEvent('post.liked')
  async handlePostLikedEvent(payload: { postId: string; userId: string }) {
    const { postId, userId } = payload;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: {
          include: {
            PushToken: true,
          },
        },
      },
    });

    if (!post) return;

    if (post.userId === userId) return;

    const author = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    await this.expoPush.sendPushToUsers([post.user], {
      title: 'Novo like ❤️',
      body: `${author?.name ?? 'Alguém'} curtiu seu post`,
      sound: 'default',
      categoryId: 'post_notification',
      data: {
        type: 'like',
        postId: post.id,
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
    const targetUser = entity.EntityCluster?.user;

    if (!targetUser) return;

    const userEmail = targetUser.email;

    const post = entity.media.post;
    const user = entity.media.post.user;
    const media = entity.media;

    await this.emailService.sendFaceDetected(userEmail, post, user, media);

    await this.expoPush.sendPushToUsers([targetUser], {
      title: 'Você apareceu em uma foto',
      body: `${user.name} te marcou em uma imagem`,
      sound: 'default',
      categoryId: 'post_notification',
      data: {
        type: 'face_detected',
        postId: post.id,
        mediaId: media.id,
      },
    });
  }
}
