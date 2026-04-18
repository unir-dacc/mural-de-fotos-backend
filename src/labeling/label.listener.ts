import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { Media, Prisma } from '@prisma/client';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

export type DetectedEntity = {
  entity_path: string;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  class_name: string;
  confidence: number;
  embedding: number[];
};

export type DetectObjectsResponse = {
  message: string;
  faces_count: number;
  faces: DetectedEntity[];
};

type PostCreatedPayload = Prisma.PostGetPayload<{ include: { Media: true } }>;

@Injectable()
export class PostCreatedListener {
  private readonly logger = new Logger(PostCreatedListener.name);

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('post.created', { async: true })
  async handle(payload: PostCreatedPayload) {
    for (const media of payload.Media) {
      await this.processMedia(media);
    }
  }

  async processMedia(media: Media) {
    this.logger.log(`Processing media: ${JSON.stringify(media, null, 2)}`);
    const THRESHOLD = 0.45;

    if (media.isVideo) {
      return;
    }

    try {
      const fileResponse = await fetch(media.imageUrl);
      if (!fileResponse.ok) {
        this.logger.warn(
          `Falha ao baixar imagem da mídia ${media.id}: ${fileResponse.status} ${fileResponse.statusText}`,
        );
        return;
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', blob, 'foto.jpg');

      const { data } = await firstValueFrom(
        this.http.post<DetectObjectsResponse>('/detect-faces', formData),
      );

      const { faces } = data;
      const persons = faces;

      if (persons.length === 0) {
        this.logger.debug(
          `Nenhuma pessoa detectada na mídia ${media.id} (${media.imageUrl})`,
        );

        await this.prisma.media.update({
          where: { id: media.id },
          data: { isProcessed: true },
        });
      }

      for (const person of persons) {
        const embeddingArr = person.embedding ?? [];

        if (!Array.isArray(embeddingArr) || embeddingArr.length === 0) {
          this.logger.debug(
            `Embedding vazio ou inválido para face na mídia ${media.id}`,
          );
          continue;
        }

        const embeddingNumbers = embeddingArr.map((v) => Number(v));
        const embeddingVectorString = `[${embeddingNumbers.join(',')}]`;

        const bboxJson = JSON.stringify(person.bbox);

        const [result] = await this.prisma.$queryRaw<
          { clusterId: string; entityId: string }[]
        >(Prisma.sql`
            WITH candidate_clusters AS (
              SELECT
                ec.id,
                ec."userId",
                MAX(1 - (e.embedding <=> ${embeddingVectorString}::vector)) AS similarity
              FROM "EntityCluster" ec
              JOIN "Entity" e ON e."clusterId" = ec.id
              GROUP BY ec.id, ec."userId"
            ),
            best_cluster AS (
              SELECT id, "userId"
              FROM candidate_clusters
              WHERE similarity >= ${THRESHOLD}
              ORDER BY similarity DESC
              LIMIT 1
            ),
            inserted_cluster AS (
              INSERT INTO "EntityCluster" (id, THRESHOLD, "createdAt", "updatedAt")
              SELECT gen_random_uuid(), ${THRESHOLD}, NOW(), NOW()
              WHERE NOT EXISTS (SELECT 1 FROM best_cluster)
              RETURNING id, "userId"
            ),
            chosen_cluster AS (
              SELECT id, "userId" FROM best_cluster
              UNION ALL
              SELECT id, "userId" FROM inserted_cluster
            ),
            inserted_entity AS (
              INSERT INTO "Entity" (
                id,
                "entityPath",
                bbox,
                "className",
                confidence,
                embedding,
                "isAboveThreshold",
                "mediaId",
                "createdAt",
                "updatedAt",
                "userId",
                "clusterId"
              )
              SELECT
                gen_random_uuid(),          -- id
                ${person.entity_path},      -- entityPath
                ${bboxJson}::jsonb,         -- bbox
                'person',       -- className
                '1',       -- confidence
                ${embeddingVectorString}::vector, -- embedding
                TRUE,                       -- isAboveThreshold
                ${media.id},                -- mediaId
                NOW(),
                NOW(),
                (SELECT "userId" FROM chosen_cluster),
                (SELECT id FROM chosen_cluster)
              RETURNING id
            )
            SELECT
              (SELECT id FROM chosen_cluster) AS "clusterId",
              (SELECT id FROM inserted_entity) AS "entityId";
      `);

        this.logger.debug(
          `Face da mídia ${media.id} salva em cluster ${result?.clusterId}, entity ${result?.entityId}`,
        );

        await this.prisma.media.update({
          where: { id: media.id },
          data: { isProcessed: true },
        });

        const cluster = await this.prisma.entityCluster.findUnique({
          where: {
            id: result.clusterId,
          },
        });
        if (cluster?.userId) {
          this.logger.log(`Sending notification to user: ${cluster.userId}`);

          await this.sendNotification(result.entityId);
        }
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar mídia ${media.id}: ${String(error)}`,
      );
    }
  }

  private async sendNotification(entityId: string) {
    const entity = await this.prisma.entity.findUnique({
      where: {
        id: entityId,
      },
      include: {
        media: { include: { post: { include: { user: true } } } },
        EntityCluster: {
          include: {
            user: true,
          },
        },
      },
    });

    this.eventEmitter.emit('face.detected', entity);
  }
}
