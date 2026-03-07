import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const MediaSchema = z.object({
  id: z.uuid().describe('Identificador único do media'),
  order: z.number().describe('Ordem do media dentro do post'),
  imageUrl: z.url().describe('URL da imagem/vídeo do media'),
  isVideo: z.boolean().describe('Indica se o media é um vídeo'),
  createdAt: z.string().describe('Data de criação do media'),
  updatedAt: z.string().describe('Data da última atualização do media'),
  thumbnailUrl: z
    .url()
    .optional()
    .nullable()
    .describe('URL da imagem/vídeo do media'),
  tags: z.any().describe('Tags em JSON do media'),
});

export class MediaDto extends createZodDto(MediaSchema) {}
