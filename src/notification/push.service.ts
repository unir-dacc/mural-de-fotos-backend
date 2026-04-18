import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';

@Injectable()
export class PushService {
  private expo = new Expo();
  private logger = new Logger(PushService.name);

  async sendPushToUsers(
    users: Prisma.UserGetPayload<{ include: { PushToken: true } }>[],
    message: Omit<ExpoPushMessage, 'to'>,
  ) {
    const tokens = users
      .flatMap((u) => u.PushToken || [])
      .map((t) => t.token)
      .filter((token) => Expo.isExpoPushToken(token));

    if (tokens.length === 0) {
      this.logger.debug('Nenhum token válido encontrado.');
      return;
    }

    const chunks = this.expo.chunkPushNotifications(
      tokens.map((token) => ({ ...message, to: token })),
    );

    const receipts: any[] = [];

    for (const chunk of chunks) {
      try {
        const response = await this.expo.sendPushNotificationsAsync(chunk);
        receipts.push(...response);
      } catch (error) {
        this.logger.error('Erro ao enviar push:', error);
      }
    }

    return receipts;
  }
}
