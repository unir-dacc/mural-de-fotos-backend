import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Prisma,
  StoryType,
  StoryVisibility,
} from '@prisma/client';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { PushService } from 'src/notification/push.service';

type StoryWithItems = Prisma.StoryGetPayload<{
  include: {
    items: {
      include: {
        media: true;
        post: true;
      };
      orderBy: { order: 'asc' };
    };
  };
}>;

type UserMediaCandidate = {
  mediaId: string;
  postId: string;
  createdAt: Date;
};

type GlobalPostCandidate = {
  postId: string;
  score: number;
};

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  @Cron('0 13 * * *', {
    name: 'stories-generation-and-cleanup',
    timeZone: 'America/Porto_Velho',
  })
  async handleStoriesCron() {
    await this.deleteExpiredStories();

    const now = new Date();
    await this.generateQuarterlyRetrospectives(now);
    await this.generateYearlyRetrospectives(now);
    await this.generateGlobalYearlyRetrospective(now);
  }

  async findAvailableStories(userId: string) {
    const stories = await this.prisma.story.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
        OR: [{ visibility: 'GLOBAL' }, { userId }],
      },
      include: {
        items: {
          include: {
            media: true,
          },
          orderBy: {
            order: 'asc',
          },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return stories.map((story) => ({
      id: story.id,
      title: story.title,
      subtitle: story.subtitle,
      type: story.type,
      visibility: story.visibility,
      periodStart: story.periodStart.toISOString(),
      periodEnd: story.periodEnd.toISOString(),
      expiresAt: story.expiresAt.toISOString(),
      userId: story.userId,
      createdAt: story.createdAt.toISOString(),
      updatedAt: story.updatedAt.toISOString(),
      coverImageUrl: story.items[0]?.media.imageUrl ?? null,
    }));
  }

  async findStoryById(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({
      where: {
        id: storyId,
        expiresAt: {
          gt: new Date(),
        },
        OR: [{ visibility: 'GLOBAL' }, { userId }],
      },
      include: {
        items: {
          include: {
            media: true,
            post: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!story) {
      throw new NotFoundException('Story não encontrada');
    }

    return this.mapStory(story);
  }

  async deleteExpiredStories(now = new Date()) {
    await this.prisma.story.deleteMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });
  }

  private async generateQuarterlyRetrospectives(referenceDate: Date) {
    const period = this.getPreviousQuarterPeriod(referenceDate);
    if (!this.isWithinGenerationWindow(referenceDate, period.end)) return;

    const users = await this.prisma.user.findMany({
      select: { id: true, name: true },
    });

    for (const user of users) {
      const mediaCandidates = await this.findUserRetrospectiveMedia(
        user.id,
        period.start,
        period.end,
      );

      if (!mediaCandidates.length) continue;

      await this.createStoryIfNotExists({
        type: 'USER_QUARTERLY_RETROSPECTIVE',
        visibility: 'USER_ONLY',
        userId: user.id,
        title: 'Sua retrospectiva trimestral',
        subtitle: this.formatPeriodLabel(period.start, period.end),
        periodStart: period.start,
        periodEnd: period.end,
        mediaCandidates,
      });
    }
  }

  private async generateYearlyRetrospectives(referenceDate: Date) {
    const generationDate = this.getFirstBusinessDayOfDecember(
      referenceDate.getFullYear(),
    );
    if (!this.isWithinGenerationWindow(referenceDate, generationDate)) return;

    const period = this.getCurrentYearRetrospectivePeriod(referenceDate);

    const users = await this.prisma.user.findMany({
      select: { id: true, name: true },
    });

    for (const user of users) {
      const mediaCandidates = await this.findUserRetrospectiveMedia(
        user.id,
        period.start,
        period.end,
      );

      if (!mediaCandidates.length) continue;

      await this.createStoryIfNotExists({
        type: 'USER_YEARLY_RETROSPECTIVE',
        visibility: 'USER_ONLY',
        userId: user.id,
        title: 'Sua retrospectiva anual',
        subtitle: this.formatPeriodLabel(period.start, period.end),
        periodStart: period.start,
        periodEnd: period.end,
        mediaCandidates,
      });
    }
  }

  private async generateGlobalYearlyRetrospective(referenceDate: Date) {
    const generationDate = this.getFirstBusinessDayOfDecember(
      referenceDate.getFullYear(),
    );
    if (!this.isWithinGenerationWindow(referenceDate, generationDate)) return;

    const period = this.getCurrentYearRetrospectivePeriod(referenceDate);

    const topPosts = await this.findTopGlobalPosts(period.start, period.end);

    if (!topPosts.length) return;

    const mediaCandidates = await this.mapGlobalPostsToMedia(topPosts);

    if (!mediaCandidates.length) return;

    await this.createStoryIfNotExists({
      type: 'GLOBAL_YEARLY_RETROSPECTIVE',
      visibility: 'GLOBAL',
      userId: null,
      title: 'Retrospectiva anual do mural',
      subtitle: this.formatPeriodLabel(period.start, period.end),
      periodStart: period.start,
      periodEnd: period.end,
      mediaCandidates,
    });
  }

  private async createStoryIfNotExists(params: {
    type: StoryType;
    visibility: StoryVisibility;
    userId: string | null;
    title: string;
    subtitle: string;
    periodStart: Date;
    periodEnd: Date;
    mediaCandidates: UserMediaCandidate[];
  }) {
    const existing = await this.prisma.story.findFirst({
      where: {
        type: params.type,
        userId: params.userId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      },
      select: { id: true },
    });

    if (existing) return;

    const uniqueMedia = Array.from(
      new Map(params.mediaCandidates.map((item) => [item.mediaId, item])).values(),
    );

    const story = await this.prisma.story.create({
      data: {
        title: params.title,
        subtitle: params.subtitle,
        type: params.type,
        visibility: params.visibility,
        userId: params.userId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        expiresAt: this.addDays(new Date(), 14),
        items: {
          create: uniqueMedia.map((item, index) => ({
            order: index + 1,
            postId: item.postId,
            mediaId: item.mediaId,
          })),
        },
      },
    });

    await this.notifyStoryCreated(story.id);
  }

  private async findUserRetrospectiveMedia(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const entities = await this.prisma.entity.findMany({
      where: {
        EntityCluster: {
          userId,
        },
        media: {
          isVideo: false,
          post: {
            createdAt: {
              gte: periodStart,
              lt: periodEnd,
            },
          },
        },
      },
      select: {
        mediaId: true,
        media: {
          select: {
            postId: true,
            createdAt: true,
          },
        },
      },
      distinct: ['mediaId'],
      orderBy: {
        media: {
          createdAt: 'asc',
        },
      },
    });

    return entities.map((entity) => ({
      mediaId: entity.mediaId,
      postId: entity.media.postId,
      createdAt: entity.media.createdAt,
    }));
  }

  private async findTopGlobalPosts(periodStart: Date, periodEnd: Date) {
    const result = await this.prisma.$queryRaw<GlobalPostCandidate[]>(Prisma.sql`
      SELECT
        p.id AS "postId",
        (
          (SELECT COUNT(*) FROM "Like" l WHERE l."postId" = p.id) * 3 +
          (SELECT COUNT(*) FROM "Comment" c WHERE c."postId" = p.id) * 2 +
          COALESCE((
            SELECT COUNT(DISTINCT e."clusterId")
            FROM "Media" m
            LEFT JOIN "Entity" e ON e."mediaId" = m.id
            WHERE m."postId" = p.id
              AND m."isVideo" = FALSE
              AND e."clusterId" IS NOT NULL
          ), 0)
        )::int AS score
      FROM "Post" p
      WHERE p."createdAt" >= ${periodStart}
        AND p."createdAt" < ${periodEnd}
      ORDER BY score DESC, p."createdAt" DESC
      LIMIT 50
    `);

    return this.shuffle(result).slice(0, 25);
  }

  private async mapGlobalPostsToMedia(posts: GlobalPostCandidate[]) {
    const medias = await this.prisma.media.findMany({
      where: {
        postId: {
          in: posts.map((post) => post.postId),
        },
        isVideo: false,
      },
      orderBy: [{ order: 'asc' }],
      select: {
        id: true,
        postId: true,
        createdAt: true,
      },
    });

    const firstMediaByPost = new Map<string, UserMediaCandidate>();

    for (const media of medias) {
      if (firstMediaByPost.has(media.postId)) continue;

      firstMediaByPost.set(media.postId, {
        mediaId: media.id,
        postId: media.postId,
        createdAt: media.createdAt,
      });
    }

    return posts
      .map((post) => firstMediaByPost.get(post.postId))
      .filter((item): item is UserMediaCandidate => !!item);
  }

  private mapStory(story: StoryWithItems) {
    return {
      id: story.id,
      title: story.title,
      subtitle: story.subtitle,
      type: story.type,
      visibility: story.visibility,
      periodStart: story.periodStart.toISOString(),
      periodEnd: story.periodEnd.toISOString(),
      expiresAt: story.expiresAt.toISOString(),
      userId: story.userId,
      createdAt: story.createdAt.toISOString(),
      updatedAt: story.updatedAt.toISOString(),
      coverImageUrl: story.items[0]?.media.imageUrl ?? null,
      items: story.items.map((item) => ({
        id: item.id,
        order: item.order,
        postId: item.postId,
        mediaId: item.mediaId,
        imageUrl: item.media.imageUrl,
        isVideo: item.media.isVideo,
        thumbnailUrl: item.post.thumbnailUrl,
        caption: item.post.caption,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private getPreviousQuarterPeriod(referenceDate: Date) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const currentQuarterStartMonth = Math.floor(month / 3) * 3;
    const start = new Date(year, currentQuarterStartMonth - 3, 1, 0, 0, 0, 0);
    const end = new Date(year, currentQuarterStartMonth, 1, 0, 0, 0, 0);

    return { start, end };
  }

  private getCurrentYearRetrospectivePeriod(referenceDate: Date) {
    const year = referenceDate.getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = this.getFirstBusinessDayOfDecember(year);

    return { start, end };
  }

  private formatPeriodLabel(periodStart: Date, periodEnd: Date) {
    const start = periodStart.toLocaleDateString('pt-BR');
    const end = new Date(periodEnd.getTime() - 1).toLocaleDateString('pt-BR');

    return `${start} - ${end}`;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private isWithinGenerationWindow(referenceDate: Date, periodEnd: Date) {
    const current = this.startOfDay(referenceDate).getTime();
    const end = this.startOfDay(periodEnd).getTime();
    const diffInDays = Math.floor((current - end) / (1000 * 60 * 60 * 24));

    return diffInDays >= 0 && diffInDays < 14;
  }

  private startOfDay(date: Date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private getFirstBusinessDayOfDecember(year: number) {
    const date = new Date(year, 11, 1, 0, 0, 0, 0);

    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }

    return date;
  }

  private shuffle<T>(items: T[]) {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }

    return copy;
  }

  private async notifyStoryCreated(storyId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: {
        user: {
          include: {
            PushToken: true,
          },
        },
        items: {
          include: {
            media: true,
          },
          orderBy: {
            order: 'asc',
          },
          take: 1,
        },
      },
    });

    if (!story) return;

    const imageUrl = story.items[0]?.media.imageUrl ?? undefined;

    if (story.visibility === 'GLOBAL') {
      const users = await this.prisma.user.findMany({
        include: {
          PushToken: true,
        },
      });

      const recipients = users.filter((user) => user.PushToken.length > 0);

      if (!recipients.length) return;

      await this.pushService.sendStoryNotification(recipients, {
        type: 'global_retrospective_story',
        storyId: story.id,
        title: 'Nova retrospectiva no mural',
        body: story.title,
        imageUrl,
      });

      return;
    }

    if (!story.user || story.user.PushToken.length === 0) return;

    await this.pushService.sendStoryNotification([story.user], {
      type: 'user_retrospective_story',
      storyId: story.id,
      title: 'Sua retrospectiva chegou',
      body: story.title,
      imageUrl,
    });
  }
}
