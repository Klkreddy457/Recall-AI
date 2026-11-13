import type { Conversation, Message } from '../types/index.js';

const STORAGE_KEY = 'recall_ai_owner_id';

export function getOwnerId(): string {
  if (typeof window === 'undefined') {
    return '00000000-0000-0000-0000-000000000000';
  }

  let ownerId = localStorage.getItem(STORAGE_KEY);
  if (!ownerId) {
    ownerId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, ownerId);
  }
  return ownerId;
}

export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function fetchConversations(search?: string): Promise<Conversation[]> {
  const ownerId = getOwnerId();
  const url = new URL(`${API_BASE}/api/conversations`, window.location.origin);
  if (search && search.trim()) {
    url.searchParams.set('search', search.trim());
  }

  const res = await fetch(url.toString(), {
    headers: {
      'x-owner-id': ownerId,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch conversations: ${res.statusText}`);
  }

  const data = (await res.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export async function createConversation(title?: string): Promise<Conversation> {
  const ownerId = getOwnerId();
  const res = await fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-owner-id': ownerId,
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create conversation: ${res.statusText}`);
  }

  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const ownerId = getOwnerId();
  const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
    method: 'DELETE',
    headers: {
      'x-owner-id': ownerId,
    },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const ownerId = getOwnerId();
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    headers: {
      'x-owner-id': ownerId,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch messages: ${res.statusText}`);
  }

  const data = (await res.json()) as { messages: Message[] };
  return data.messages;
}

