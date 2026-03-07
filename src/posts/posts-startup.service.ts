import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { PostsService } from './posts.service';

@Injectable()
export class PostsStartup implements OnModuleInit {
  private readonly logger = new Logger(PostsStartup.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {}

  async onModuleInit() {
    const posts = await this.prisma.post.findMany({
      where: {
        thumbnailUrl: null,
      },
      include: {
        Media: {
          orderBy: { order: 'asc' },
          take: 1,
        },
      },
    });

    if (posts.length === 0) {
      this.logger.log('Nenhum post sem thumbnail encontrado');
      return;
    }

    this.logger.log(`Gerando thumbnails para ${posts.length} posts...`);

    for (const post of posts) {
      const firstMedia = post.Media[0];
      if (!firstMedia) continue;

      try {
        const thumbnailUrl = await this.postsService.generateThumbnailFromUrl(
          firstMedia.imageUrl,
          firstMedia.isVideo,
          post.id,
        );

        await this.prisma.post.update({
          where: { id: post.id },
          data: { thumbnailUrl },
        });

        this.logger.log(`Thumbnail gerada para post ${post.id}`);
      } catch (error) {
        this.logger.error(
          `Erro ao gerar thumbnail para post ${post.id}`,
          error,
        );
      }
    }

    this.logger.log('Processo de geração de thumbnails concluído');
  }
}
