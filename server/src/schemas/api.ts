import { z } from 'zod';

export const ownerHeaderSchema = z.object({
  'x-owner-id': z.string().uuid({ message: 'x-owner-id must be a valid UUID' }),
});

export const conversationIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Conversation id must be a valid UUID' }),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

export const listConversationsQuerySchema = z.object({
  search: z.string().trim().optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

