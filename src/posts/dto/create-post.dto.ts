import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreatePostSchema = z.object({
  caption: z.string().describe('Legenda opcional do post'),
  public: z.coerce
    .boolean()
    .default(false)
    .describe('Define se o post é público'),
});

export class CreatePostDto extends createZodDto(CreatePostSchema) {}
