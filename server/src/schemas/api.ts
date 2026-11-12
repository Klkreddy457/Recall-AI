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

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid({ message: 'conversationId must be a valid UUID' }).optional(),
  message: z.string().trim().min(1, { message: 'Message cannot be empty' }),
  timezone: z.string().optional().default('UTC'),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

