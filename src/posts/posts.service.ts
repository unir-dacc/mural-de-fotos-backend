import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { CreatePostDto, CreatePostSchema } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { createPaginator } from 'prisma-pagination';
import { Prisma, Post } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AwsUploadService } from 'src/aws/aws.service';
import * as sharp from 'sharp';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface UploadItem {
  isVideo: boolean;
  uploadPromise: Promise<{ url: string }>;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly aws: AwsUploadService,
  ) {}

  async createPost(
    userId: string,
    createPostDto: CreatePostDto,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Envie pelo menos um arquivo válido');
    }

    const parsed = CreatePostSchema.parse(createPostDto);

    const uploads: UploadItem[] = [];
    let thumbnailUploadPromise: Promise<{ url: string }> | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      const isImage = file.mimetype.startsWith('image/');
      const isVideo = file.mimetype.startsWith('video/');

      if (!isImage && !isVideo) {
        throw new BadRequestException(
          'Todos os arquivos devem ser imagens ou vídeos válidos',
        );
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const fileExtension = file.originalname.split('.').pop();
      const filename = `${uniqueSuffix}.${fileExtension}`;
      const folder = isVideo ? 'posts/videos' : 'posts/images';

      const uploadPromise = this.aws.uploadFile({
        buffer: file.buffer,
        fileName: filename,
        mimeType: file.mimetype,
        folder,
      });

      // Gera thumbnail apenas do primeiro arquivo
      if (i === 0) {
        if (isImage) {
          const thumbnailBuffer = await sharp(file.buffer)
            .rotate()
            .resize({
              width: 400,
              fit: 'inside',
              position: 'centre',
            })
            .jpeg({ quality: 70 })
            .toBuffer();

          thumbnailUploadPromise = this.aws.uploadFile({
            buffer: thumbnailBuffer,
            fileName: `thumb_${uniqueSuffix}.jpg`,
            mimeType: 'image/jpeg',
            folder: 'posts/thumbnails',
          });
        } else if (isVideo) {
          const thumbnailBuffer = await this.extractVideoThumbnail(file.buffer);

          thumbnailUploadPromise = this.aws.uploadFile({
            buffer: thumbnailBuffer,
            fileName: `thumb_${uniqueSuffix}.jpg`,
            mimeType: 'image/jpeg',
            folder: 'posts/thumbnails',
          });
        }
      }

      uploads.push({ isVideo, uploadPromise });
    }

    if (uploads.length === 0) {
      throw new BadRequestException('Nenhum arquivo válido foi enviado');
    }

    const [originalResults, thumbnailResult] = await Promise.all([
      Promise.all(uploads.map((u) => u.uploadPromise)),
      thumbnailUploadPromise,
    ]);

    const post = await this.prisma.post.create({
      data: {
        ...parsed,
        userId,
        thumbnailUrl: thumbnailResult?.url ?? null,
        Media: {
          create: originalResults.map((result, index) => ({
            imageUrl: result.url,
            isVideo: uploads[index].isVideo,
            order: index + 1,
          })),
        },
      },
      include: {
        Media: true,
      },
    });

    this.eventEmitter.emit('post.created', {
      ...post,
      caption: createPostDto.caption,
    });

    return post;
  }

  async generateThumbnailFromUrl(
    mediaUrl: string,
    isVideo: boolean,
    postId: string,
  ): Promise<string> {
    const response = await fetch(mediaUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    const uniqueSuffix = `${Date.now()}-${postId}`;

    let thumbnailBuffer: Buffer;

    if (isVideo) {
      thumbnailBuffer = await this.extractVideoThumbnail(buffer);
    } else {
      thumbnailBuffer = await sharp(buffer)
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
    }

    const result = await this.aws.uploadFile({
      buffer: thumbnailBuffer,
      fileName: `thumb_${uniqueSuffix}.jpg`,
      mimeType: 'image/jpeg',
      folder: 'posts/thumbnails',
    });

    return result.url;
  }

  private async extractVideoThumbnail(videoBuffer: Buffer): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `input_${Date.now()}.mp4`);
    const outputPath = path.join(tmpDir, `thumb_${Date.now()}.jpg`);

    try {
      fs.writeFileSync(inputPath, videoBuffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .screenshots({
            timestamps: ['00:00:01'],
            filename: path.basename(outputPath),
            folder: path.dirname(outputPath),
          })
          .on('end', () => resolve())
          .on('error', reject);
      });

      const frameBuffer: Buffer = fs.readFileSync(outputPath);

      return await sharp(frameBuffer)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        Media: true,
        user: {
          select: {
            id: true,
            avatarUrl: true,
            name: true,
          },
        },
        comments: {
          include: {
            user: {},
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });
    if (!post) {
      throw new NotFoundException('Post não encontrado');
    }
    return post;
  }

  async findAll(query: any, isLogged: boolean) {
    const {
      page,
      limit,
      userId,
      orderBy = 'createdAt',
      order = 'desc',
      search,
    } = query;

    const paginate = createPaginator({ page, perPage: limit });

    const orderByClause =
      orderBy === 'likes'
        ? { likes: { _count: order } }
        : orderBy === 'comments'
          ? { comments: { _count: order } }
          : { [orderBy]: order };

    const whereAnd: Prisma.PostWhereInput[] = [];

    // Só públicos se não estiver logado
    if (!isLogged) {
      whereAnd.push({ public: true });
    }

    // Filtro por userId (já existia)
    if (userId) {
      whereAnd.push({
        Media: {
          some: {
            entities: {
              some: {
                EntityCluster: {
                  userId,
                },
              },
            },
          },
        },
      });
    }

    // 🔍 Filtro de busca
    if (search) {
      whereAnd.push(buildSearchWhere(search));
    }

    const where: Prisma.PostWhereInput = whereAnd.length
      ? { AND: whereAnd }
      : {};

    const queryResult = await paginate<Post[], Prisma.PostFindManyArgs>(
      this.prisma.post,
      {
        where,
        include: {
          Media: {
            where: { order: 1 },
          },
          likes: true,
          user: {
            select: {
              id: true,
              avatarUrl: true,
              name: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              Media: true,
            },
          },
        },
        orderBy: orderByClause,
      },
    );

    return queryResult;
  }

  async updatePost(id: string, updatePostDto: UpdatePostDto) {
    const post = await this.prisma.post.update({
      where: { id },
      data: {
        ...updatePostDto,
      },
    });
    return post;
  }

  async removePost(id: string) {
    const post = await this.prisma.post.delete({
      where: { id },
    });
    return post;
  }

  async label(userId: string, entityId: string) {
    return await this.prisma.entity.update({
      where: {
        id: entityId,
      },
      data: {
        userId: userId,
      },
    });
  }
}

function buildSearchWhere(raw: string): Prisma.PostWhereInput {
  const term = raw.trim();
  if (!term) return {};

  const tokens = term.split(/\s+/);

  const tokenConditions: Prisma.PostWhereInput[] = tokens.map((token) => ({
    OR: [
      {
        caption: {
          contains: token,
          mode: 'insensitive',
        },
      },

      {
        user: {
          name: {
            contains: token,
            mode: 'insensitive',
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                name: {
                  contains: token,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                className: {
                  contains: token,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                EntityCluster: {
                  OR: [
                    {
                      name: {
                        contains: token,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  }));

  return {
    AND: tokenConditions,
  };
}
