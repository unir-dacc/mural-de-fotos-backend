import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const TaggedUserIdsSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [value];
    }
  }

  return value;
}, z.array(z.uuid()).optional());

export const UpdatePostSchema = z.object({
  caption: z.string().optional().describe('Legenda opcional do post'),
  imageUrl: z.string().url().optional().describe('URL da imagem do post'),
  public: z.coerce
    .boolean()
    .optional()
    .describe('Define se o post é público'),
  taggedUserIds: TaggedUserIdsSchema.describe(
    'IDs dos usuários marcados no post',
  ),
});

export class UpdatePostDto extends createZodDto(UpdatePostSchema) {}
