import { z } from 'zod';
import { isValidCPF } from 'src/shareds/helpers/isValidCpf';

export const UserSchema = z.object({
  id: z.uuid().describe('User ID'),
  email: z.email().describe('User Email'),
  avatarUrl: z.url().optional(),
  name: z.string().min(2).describe('First Name'),
  cpf: z
    .string()
    .min(11)
    .max(11)
    .refine(isValidCPF, { message: 'Invalid CPF' })
    .describe('User CPF'),
  bio: z.string().default(''),

  createdAt: z.string().optional().describe('Date of Creation'),
  updatedAt: z.string().optional().describe('Date of Update'),
});

export const UserOrderType = Object.keys(UserSchema.omit({ id: true }).shape);
export type UserDtoType = z.infer<typeof UserSchema>;
