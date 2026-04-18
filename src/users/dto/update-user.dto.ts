import { Platform } from '@prisma/client';
import { UserSchema } from '../entities/user.entity';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateUserSchema = UserSchema.omit({
  id: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  cpf: true,
})
  .extend({
    password: z.string().min(6).optional().describe('User Password'),
    token: z.string().optional().describe('Expo push token'),
    platform: z.enum(Platform).optional(),
  })
  .partial();

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
