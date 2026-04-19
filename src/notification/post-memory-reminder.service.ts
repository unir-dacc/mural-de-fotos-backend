import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/databases/prisma/prisma.service';

export type PostMemoryReminderType =
  | 'ONE_WEEK'
  | 'ONE_MONTH'
  | 'SIX_MONTHS'
  | 'YEARLY';

type ReminderRule = {
  type: PostMemoryReminderType;
  getTargetDate: (reference: Date) => Date;
};

@Injectable()
export class PostMemoryReminderService {
  private readonly logger = new Logger(PostMemoryReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('0 13 * * *', {
    name: 'post-memory-reminder',
    timeZone: 'America/Porto_Velho',
  })
  async handleDailyReminderCron() {
    try {
      await this.processDailyReminders();
    } catch (error) {
      this.logger.error('Erro ao processar lembretes diários', error);
    }
  }

  async processDailyReminders(referenceDate = new Date()) {
    const reminderDate = this.startOfDay(referenceDate);
    const yearlyWindow = this.getYearlyWindow(reminderDate);

    const rules: ReminderRule[] = [
      {
        type: 'ONE_WEEK',
        getTargetDate: (date) => this.addDays(date, -7),
      },
      {
        type: 'ONE_MONTH',
        getTargetDate: (date) => this.addMonths(date, -1),
      },
      {
        type: 'SIX_MONTHS',
        getTargetDate: (date) => this.addMonths(date, -6),
      },
    ];

    for (const rule of rules) {
      const targetDate = rule.getTargetDate(reminderDate);
      const window = this.getDayWindow(targetDate);

      const posts = await this.prisma.post.findMany({
        where: {
          createdAt: {
            gte: window.start,
            lt: window.end,
          },
        },
        include: {
          user: true,
        },
      });

      for (const post of posts) {
        this.dispatchReminder(post, rule.type);
      }
    }

    const yearlyPosts = await this.prisma.post.findMany({
      where: {
        createdAt: {
          lt: yearlyWindow.before,
        },
      },
      include: {
        user: true,
      },
    });

    for (const post of yearlyPosts) {
      if (!this.isSameMonthAndDay(post.createdAt, reminderDate)) continue;
      this.dispatchReminder(post, 'YEARLY');
    }

    this.logger.log(
      `Verificação de lembretes concluída para ${reminderDate.toISOString()}`,
    );
  }

  private dispatchReminder(
    post: {
      id: string;
      thumbnailUrl: string | null;
      userId: string;
      createdAt: Date;
      user: { id: string; name: string | null };
    },
    type: PostMemoryReminderType,
  ) {
    this.eventEmitter.emit('post.memory_reminder', {
      postId: post.id,
      authorId: post.userId,
      authorName: post.user.name,
      thumbnailUrl: post.thumbnailUrl,
      type,
    });
  }

  private getDayWindow(date: Date) {
    const start = this.startOfDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start, end };
  }

  private getYearlyWindow(date: Date) {
    const before = new Date(date);
    before.setFullYear(before.getFullYear() - 1);
    return { before };
  }

  private startOfDay(date: Date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private addDays(date: Date, amount: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  private addMonths(date: Date, amount: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + amount);
    return result;
  }

  private isSameMonthAndDay(left: Date, right: Date) {
    return (
      left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
    );
  }
}
