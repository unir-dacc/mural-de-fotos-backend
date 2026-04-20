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
    const invalidTokens: string[] = [];

    const names =
      usersWithValidTokens.length > 0
        ? usersWithValidTokens.map((u) => u.name).join(', ')
        : 'Nenhum usuário';

    this.logger.log(
      `Sending push notification ${message.data?.type} ${JSON.stringify(message)} to: ${names}`,
    );

    for (const user of usersWithValidTokens) {
      let delivered = false;

      for (const pushToken of user.PushToken) {
        const expoMessage = {
          to: pushToken.token,
          title: message.title,
          body: message.body,
          sound: message.sound,
          categoryId: message.categoryId,
          data: message.data,
          mutableContent: true,
          image: message.imageUrl,
        };

        try {
          const [receipt] =
            await this.expo.sendPushNotificationsAsync([
              expoMessage as ExpoPushMessage,
            ]);

          if (receipt?.status === 'ok') {
            delivered = true;
            break;
          }

          const error = receipt?.details?.error;

          if (error === 'DeviceNotRegistered') {
            invalidTokens.push(pushToken.token);
          }

          this.logger.warn(`Push error: ${error} - token: ${pushToken.token}`);
        } catch (err) {
          this.logger.error('Erro ao enviar push:', err);
        }
      }

      if (!delivered) {
        this.logger.warn(
          `Nenhum token do usuário ${user.id} recebeu o push com sucesso.`,
        );
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
