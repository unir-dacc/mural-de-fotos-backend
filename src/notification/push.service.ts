import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/databases/prisma/prisma.service';

@Injectable()
export class PushService {
  private expo = new Expo();
  private logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendPushToUsers(
    users: Prisma.UserGetPayload<{ include: { PushToken: true } }>[],
    message: Omit<ExpoPushMessage, 'to'>,
  ) {
    const tokensWithMeta = users
      .flatMap((u) => u.PushToken || [])
      .filter((t) => Expo.isExpoPushToken(t.token));

    if (tokensWithMeta.length === 0) {
      this.logger.debug('Nenhum token válido encontrado.');
      return;
    }

    const messages = tokensWithMeta.map((t) => ({
      to: t.token,
      ...message,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);

    const invalidTokens: string[] = [];

    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.sendPushNotificationsAsync(chunk);

        receipts.forEach((receipt, index) => {
          if (receipt.status === 'error') {
            const error = receipt.details?.error;

            if (error === 'DeviceNotRegistered') {
              const token = chunk[index].to as string;
              invalidTokens.push(token);
            }

            this.logger.warn(
              `Push error: ${error} - token: ${chunk[index].to}`,
            );
          }
        });
      } catch (error) {
        this.logger.error('Erro ao enviar push:', error);
      }
    }

    if (invalidTokens.length > 0) {
      this.logger.warn(`Removendo ${invalidTokens.length} tokens inválidos...`);

      await this.prisma.pushToken.deleteMany({
        where: {
          token: { in: invalidTokens },
        },
      });
    }
  }
}
