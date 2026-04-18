import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from './email.service';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { PushService } from './push.service';
import { Comment } from '@prisma/client';

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
        user: { include: { PushToken: true } },
      },
    });

    if (!post) return;

    const author = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!author) return;

    const recipients = [post.user].filter((u) => u.id !== userId);

    await this.emailService.sendCommentNotification(comment, post, recipients);

    await this.expoPush.sendPostNotification(recipients, {
      type: 'comment',
      postId: post.id,
      actorId: author.id,
      actorName: author.name ?? 'Alguém',

      title: 'Novo comentário',
      body: `${author.name ?? 'Alguém'} comentou: "${comment.content}"`,

      previewImage: post.thumbnailUrl ?? undefined,
    });
  }

  @OnEvent('post.liked')
  async handlePostLikedEvent(payload: { postId: string; userId: string }) {
    const { postId, userId } = payload;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { include: { PushToken: true } },
      },
    });

    if (!post) return;
    if (post.userId === userId) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!actor) return;

    await this.expoPush.sendPostNotification([post.user], {
      type: 'like',
      postId: post.id,
      actorId: actor.id,
      actorName: actor.name ?? 'Alguém',

      title: 'Novo like ❤️',
      body: `${actor.name ?? 'Alguém'} curtiu seu post`,

      previewImage: post.thumbnailUrl ?? undefined,
    });
  }

  @OnEvent('password.reset')
  async handlePasswordResetEvent(payload: {
    email: string;
    resetPasswordCode: string;
  }) {
    await this.emailService.sendPasswordRecovery(
      payload.email,
      payload.resetPasswordCode,
    );
  }

  @OnEvent('face.detected')
  async handleFaceDetected(payload: any) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: payload.EntityCluster?.user?.id },
      include: { PushToken: true },
    });

    if (!targetUser) return;

    const post = payload.media.post;
    const media = payload.media;
    const user = post.user;

    await this.emailService.sendFaceDetected(
      targetUser.email,
      post,
      user,
      media,
    );

    await this.expoPush.sendPostNotification([targetUser], {
      type: 'face_detected',
      postId: post.id,
      mediaId: media.id,

      actorId: user.id,
      actorName: user.name ?? 'Alguém',

      title: 'Você apareceu em uma foto',
      body: `${user.name ?? 'Alguém'} te marcou em uma imagem`,

      previewImage: media.url ?? undefined,
    });
  }
}
