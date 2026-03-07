import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { MediaSchema } from './media.dto';
import { PaginatedOutputSchema } from 'src/common/dtos/pagination.dto';
import { GetUserSchema } from 'src/users/dto/get-user.dto';

export const GetPostSchema = z.object({
  id: z.uuid().describe('Identificador único do post'),
  caption: z.string().describe('Legenda do post'),
  public: z.boolean().describe('Define se o post é público'),
  createdAt: z.string().describe('Data de criação do post'),
  updatedAt: z.string().describe('Data da última atualização do post'),
  userId: z.uuid().describe('Identificador do usuário que criou o post'),
  isVideo: z.boolean().describe('Indica se o post é um vídeo'),
  Media: z
    .array(MediaSchema)
    .default([])
    .describe('Lista de mídias (imagens/vídeos) do post'),
  thumbnailUrl: z
    .url()
    .optional()
    .nullable()
    .describe('URL da imagem/vídeo do media'),
  _count: z.object({
    likes: z.number(),
    comments: z.number(),
    Media: z.number(),
  }),
  user: GetUserSchema,
});

export class GetPostDto extends createZodDto(GetPostSchema) {}

export const GetPaginatedPostSchema = PaginatedOutputSchema.extend({
  data: z.array(GetPostSchema),
});

export class GetPaginatedPostDto extends createZodDto(GetPaginatedPostSchema) {}
