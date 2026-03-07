import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetUserSchema = z.object({
  id: z.uuid().describe('Unique identifier for the user'),
  email: z.email().describe('Email address of the user'),
  name: z.string().describe('Name of the user'),
  cpf: z.string().describe('CPF of the user'),

  avatarUrl: z.url().optional().nullable(),
  bio: z.string().optional().nullable(),

  createdAt: z.string().describe('Date when the user was created'),
  updatedAt: z.string().describe('Date when the user was last updated'),
});

export class GetUserDto extends createZodDto(GetUserSchema) {}
