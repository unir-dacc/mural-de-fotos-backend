import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const StoryItemSchema = z.object({
  id: z.uuid(),
  order: z.number(),
  postId: z.uuid(),
  mediaId: z.uuid(),
  imageUrl: z.url(),
  isVideo: z.boolean(),
  thumbnailUrl: z.url().nullable(),
  caption: z.string().nullable(),
  createdAt: z.string(),
});

export const StorySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
  type: z.enum([
    'USER_QUARTERLY_RETROSPECTIVE',
    'USER_YEARLY_RETROSPECTIVE',
    'GLOBAL_YEARLY_RETROSPECTIVE',
  ]),
  visibility: z.enum(['USER_ONLY', 'GLOBAL']),
  periodStart: z.string(),
  periodEnd: z.string(),
  expiresAt: z.string(),
  userId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  coverImageUrl: z.url().nullable(),
  items: z.array(StoryItemSchema).default([]),
});

export class StoryDto extends createZodDto(StorySchema) {}

export const StoryListItemSchema = StorySchema.omit({ items: true });

export class StoryListItemDto extends createZodDto(StoryListItemSchema) {}

export const StoryListSchema = z.array(StoryListItemSchema);

export class StoryListDto extends createZodDto(StoryListSchema) {}
