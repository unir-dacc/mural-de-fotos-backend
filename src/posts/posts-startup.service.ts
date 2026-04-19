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
        thumbnailUrl: null,
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

    this.logger.log(`Reprocessando ${posts.length} posts sem thumbnail`);

    for (const post of posts) {
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
              thumbnailUrl: uploadedMedia[0]?.imageUrl ?? post.thumbnailUrl,
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
