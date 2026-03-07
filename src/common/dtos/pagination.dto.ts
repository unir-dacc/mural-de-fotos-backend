import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Number(val || 1))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'page deve ser um número positivo',
    }),

  limit: z
    .string()
    .optional()
    .transform((val) => Number(val || 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'limit deve ser um número positivo',
    }),
});

export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;

export class PaginatedOutputDto<T> {
  data: T[];
  meta: {
    total: number;
    lastPage: number;
    currentPage: number;
    perPage: number;
    prev: number | null;
    next: number | null;
  };
}

export const PaginatedOutputSchema = z.object({
  meta: z.object({
    total: z.number(),
    lastPage: z.number(),
    currentPage: z.number(),
    perPage: z.number(),
    prev: z.number().nullable(),
    next: z.number().nullable(),
  }),
});
