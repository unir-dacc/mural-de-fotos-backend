import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { AwsUploadService } from 'src/aws/aws.service';
import { PostsService } from './posts.service';

@Injectable()
export class PostsStartupService implements OnModuleInit {
  private readonly logger = new Logger(PostsStartupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aws: AwsUploadService,
    private readonly postsService: PostsService,
  ) {}

  async onModuleInit() {
    const posts = await this.prisma.post.findMany({
      where: {
        Media: {
          some: {},
        },
      },
      include: {
        Media: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (posts.length === 0) {
      return;
    }

    const postsToProcess = posts.filter((post) => {
      const firstMedia = post.Media[0];

      if (!firstMedia) {
        return false;
      }

      if (post.thumbnailUrl === null) {
        return true;
      }

      return firstMedia.isVideo && post.thumbnailUrl === firstMedia.imageUrl;
    });

    if (postsToProcess.length === 0) {
      return;
    }

    this.logger.log(
      `Reprocessando ${postsToProcess.length} posts com thumbnail pendente`,
    );

    for (const post of postsToProcess) {
      try {
        const uploadedMedia: Array<{ id: string; imageUrl: string }> = [];

        for (const media of post.Media) {
          const optimizedMedia = await this.postsService.optimizeMediaFromUrl(
            media.imageUrl,
            media.isVideo,
          );
          const fileName = media.isVideo
            ? `${media.id}.mp4`
            : `${media.id}.${optimizedMedia.extension}`;
          const folder = media.isVideo ? 'posts/videos' : 'posts/images';

          const result = await this.aws.uploadFile({
            buffer: optimizedMedia.buffer,
            fileName,
            mimeType: optimizedMedia.mimeType,
            folder,
          });

          uploadedMedia.push({
            id: media.id,
            imageUrl: result.url,
          });
        }

        const firstMedia = post.Media[0];
        const firstUploadedMedia = uploadedMedia[0];
        const thumbnailUrl =
          firstMedia?.isVideo && firstUploadedMedia
            ? await this.postsService.generateThumbnailFromVideoUrl(
                firstUploadedMedia.imageUrl,
                post.id,
              )
            : (firstUploadedMedia?.imageUrl ?? post.thumbnailUrl);

        await this.prisma.$transaction([
          ...uploadedMedia.map((media) =>
            this.prisma.media.update({
              where: { id: media.id },
              data: { imageUrl: media.imageUrl },
            }),
          ),
          this.prisma.post.update({
            where: { id: post.id },
            data: {
              thumbnailUrl,
            },
          }),
        ]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'erro desconhecido';
        this.logger.error(
          `Falha ao reprocessar o post ${post.id}: ${message}`,
        );
      }
    }
  }
}
