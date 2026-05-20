import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/databases/prisma/prisma.service';

export type PostNotificationType =
  | 'comment'
  | 'like'
  | 'face_detected'
  | 'new_post'
  | 'memory_reminder';

export type StoryNotificationType =
  | 'story_available'
  | 'user_retrospective_story'
  | 'global_retrospective_story';

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

export type StoryNotificationPayload = {
  type: StoryNotificationType;
  storyId: string;

  title: string;
  body: string;

  imageUrl?: string;
};

type InternalPushMessage = Omit<ExpoPushMessage, 'to'> & {
  imageUrl?: string;
};

@Injectable()
export class PushService {
  private expo = new Expo();
  private logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendPushToUsers(
    users: Prisma.UserGetPayload<{ include: { PushToken: true } }>[],
    message: InternalPushMessage,
  ) {
    const usersWithValidTokens = users
      .map((user) => ({
        ...user,
        PushToken: (user.PushToken || []).filter((token) =>
          Expo.isExpoPushToken(token.token),
        ),
      }))
      .filter((user) => user.PushToken.length > 0);

    if (!usersWithValidTokens.length) {
      this.logger.debug('Nenhum token válido encontrado.');
      return;
    }

    const names = usersWithValidTokens.map((u) => u.name).join(', ');

    this.logger.log(
      `Sending push notification ${message.data?.type} to: ${names}`,
    );

    const messages: ExpoPushMessage[] = [];

    for (const user of usersWithValidTokens) {
      for (const pushToken of user.PushToken) {
        messages.push({
          to: pushToken.token,
          title: message.title,
          body: message.body,
          sound: message.sound,
          categoryId: message.categoryId,
          data: message.data,
          mutableContent: true,
          richContent: message.imageUrl
            ? {
                image: message.imageUrl,
              }
            : undefined,
        });
      }
    }

    const chunks = this.expo.chunkPushNotifications(messages);

    const ticketIds: string[] = [];
    const invalidTokens: string[] = [];

    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);

        for (let i = 0; i < tickets.length; i++) {
          const ticket: ExpoPushTicket = tickets[i];
          const message = chunk[i];

          if (ticket.status === 'ok') {
            if (ticket.id) {
              ticketIds.push(ticket.id);
            }

            continue;
          }

          const error = ticket.details?.error;

          this.logger.warn(
            `Push ticket error: ${error} - token: ${message.to}`,
          );

          if (error === 'DeviceNotRegistered') {
            invalidTokens.push(message.to as string);
          }
        }
      } catch (error) {
        this.logger.error('Erro ao enviar chunk de notificações', error);
      }
    }

    if (invalidTokens.length > 0) {
      await this.removeInvalidTokens(invalidTokens);
    }

    if (ticketIds.length > 0) {
      // Processa receipts em background
      setTimeout(() => {
        this.processReceipts(ticketIds).catch((err) => {
          this.logger.error('Erro ao processar receipts', err);
        });
      }, 30000);
    }
  }

  private async processReceipts(ticketIds: string[]) {
    const receiptChunks = this.expo.chunkPushNotificationReceiptIds(ticketIds);

    const invalidTokens: string[] = [];

    for (const chunk of receiptChunks) {
      try {
        const receipts =
          await this.expo.getPushNotificationReceiptsAsync(chunk);

        for (const receiptId in receipts) {
          const receipt = receipts[receiptId];

          if (receipt.status === 'ok') {
            continue;
          }

          const error = receipt.details?.error;

          this.logger.warn(`Push receipt error: ${error}`);

          if (error === 'DeviceNotRegistered') {
            this.logger.warn(
              `Dispositivo não registrado detectado via receipt`,
            );
          }
        }
      } catch (error) {
        this.logger.error('Erro ao buscar receipts do Expo', error);
      }
    }

    if (invalidTokens.length > 0) {
      await this.removeInvalidTokens(invalidTokens);
    }
  }

  private async removeInvalidTokens(tokens: string[]) {
    const uniqueTokens = [...new Set(tokens)];

    this.logger.warn(`Removendo ${uniqueTokens.length} tokens inválidos`);

    await this.prisma.pushToken.deleteMany({
      where: {
        token: {
          in: uniqueTokens,
        },
      },
    });
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

  async sendStoryNotification(
    users: Prisma.UserGetPayload<{ include: { PushToken: true } }>[],
    payload: StoryNotificationPayload,
  ) {
    return this.sendPushToUsers(users, {
      title: payload.title,
      body: payload.body,
      sound: 'default',
      categoryId: 'default_notification',
      data: {
        type: payload.type,
        storyId: payload.storyId,
        imageUrl: payload.imageUrl,
      },
      imageUrl: payload.imageUrl,
    });
  }
}
