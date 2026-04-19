import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/databases/prisma/prisma.service';

export type PostNotificationType =
  | 'comment'
  | 'like'
  | 'face_detected'
  | 'new_post'
  | 'memory_reminder';

export type PostNotificationPayload = {
  type: PostNotificationType;
  postId: string;
  mediaId?: string;

  actorId?: string;
  actorName?: string;

  title: string;
  body: string;

  imageUrl?: string;
};

type InternalPushMessage = Omit<ExpoPushMessage, 'to'> & { imageUrl?: string };

@Injectable()
export class PushService {
  private expo = new Expo();
  private logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendPushToUsers(
    users: Prisma.UserGetPayload<{ include: { PushToken: true } }>[],
    message: InternalPushMessage,
  ) {
    const tokens = users
      .flatMap((u) => u.PushToken || [])
      .filter((t) => Expo.isExpoPushToken(t.token));

    if (!tokens.length) {
      this.logger.debug('Nenhum token válido encontrado.');
      return;
    }

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: message.title,
      body: message.body,
      sound: message.sound,
      categoryId: message.categoryId,
      data: message.data,
      mutableContent: true,
      attachments: message.imageUrl ? [{ url: message.imageUrl }] : undefined,
      image: message.imageUrl,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const invalidTokens: string[] = [];

    const names =
      users.length > 0 ? users.map((u) => u.name).join(', ') : 'Nenhum usuário';

    this.logger.log(
      `Sending push notification ${message.data?.type}: ${names}`,
    );

    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.sendPushNotificationsAsync(chunk);

        receipts.forEach((receipt, index) => {
          if (receipt.status === 'error') {
            const error = receipt.details?.error;

            if (error === 'DeviceNotRegistered') {
              invalidTokens.push(chunk[index].to as string);
            }

            this.logger.warn(
              `Push error: ${error} - token: ${chunk[index].to}`,
            );
          }
        });
      } catch (err) {
        this.logger.error('Erro ao enviar push:', err);
      }
    }

    if (invalidTokens.length) {
      await this.prisma.pushToken.deleteMany({
        where: { token: { in: invalidTokens } },
      });
    }
  }

  async sendPostNotification(
    users: Prisma.UserGetPayload<{ include: { PushToken: true } }>[],
    payload: PostNotificationPayload,
  ) {
    const categoryId =
      payload.type === 'new_post' ? 'new_post' : 'default_notification';

    return this.sendPushToUsers(users, {
      title: payload.title,
      body: payload.body,
      sound: 'default',
      categoryId,
      data: {
        type: payload.type,
        postId: payload.postId,
        mediaId: payload.mediaId,
        actorId: payload.actorId,
        actorName: payload.actorName,
        imageUrl: payload.imageUrl,
      },
      imageUrl: payload.imageUrl,
    });
  }
}
