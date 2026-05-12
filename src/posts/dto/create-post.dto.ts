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

export const CreatePostSchema = z.object({
  caption: z.string().describe('Legenda opcional do post'),
  public: z.coerce
    .boolean()
    .default(false)
    .describe('Define se o post é público'),
  taggedUserIds: TaggedUserIdsSchema.describe(
    'IDs dos usuários marcados no post',
  ),
});

export class CreatePostDto extends createZodDto(CreatePostSchema) {}
