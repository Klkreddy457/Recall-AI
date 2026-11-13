import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

export interface ConversationRecord {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  created_at: string;
  sources_json: unknown;
  search_metadata: unknown;
}

export interface DataStore {
  listConversations(ownerId: string, search?: string): Promise<ConversationRecord[]>;
  createConversation(ownerId: string, title: string): Promise<ConversationRecord>;
  getConversation(id: string, ownerId: string): Promise<ConversationRecord | null>;
  updateConversation(id: string, updates: { title?: string; updated_at?: string }): Promise<void>;
  deleteConversation(id: string, ownerId: string): Promise<boolean>;
  listMessages(conversationId: string): Promise<MessageRecord[]>;
  insertMessage(message: {
    id?: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    status?: string;
    sources_json?: unknown;
    search_metadata?: unknown;
  }): Promise<MessageRecord>;
}

// In-Memory Data Store Fallback (used when PostgreSQL is not connected)
export class InMemoryDataStore implements DataStore {
  private conversations: Map<string, ConversationRecord> = new Map();
  private messages: Map<string, MessageRecord> = new Map();

  async listConversations(ownerId: string, search?: string): Promise<ConversationRecord[]> {
    let list = Array.from(this.conversations.values()).filter((c) => c.owner_id === ownerId);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }

    // Sort by updated_at desc
    return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  async createConversation(ownerId: string, title: string): Promise<ConversationRecord> {
    const now = new Date().toISOString();
    const conv: ConversationRecord = {
      id: randomUUID(),
      owner_id: ownerId,
      title: title || 'New Conversation',
      created_at: now,
      updated_at: now,
    };
    this.conversations.set(conv.id, conv);
    return conv;
  }

  async getConversation(id: string, ownerId: string): Promise<ConversationRecord | null> {
    const conv = this.conversations.get(id);
    if (!conv || conv.owner_id !== ownerId) return null;
    return conv;
  }

  async updateConversation(
    id: string,
    updates: { title?: string; updated_at?: string }
  ): Promise<void> {
    const conv = this.conversations.get(id);
    if (!conv) return;
    if (updates.title !== undefined) conv.title = updates.title;
    conv.updated_at = updates.updated_at || new Date().toISOString();
  }

  async deleteConversation(id: string, ownerId: string): Promise<boolean> {
    const conv = this.conversations.get(id);
    if (!conv || conv.owner_id !== ownerId) return false;

    this.conversations.delete(id);
    for (const [msgId, msg] of this.messages.entries()) {
      if (msg.conversation_id === id) {
        this.messages.delete(msgId);
      }
    }
    return true;
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async insertMessage(message: {
    id?: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    status?: string;
    sources_json?: unknown;
    search_metadata?: unknown;
  }): Promise<MessageRecord> {
    const now = new Date().toISOString();
    const record: MessageRecord = {
      id: message.id || randomUUID(),
      conversation_id: message.conversation_id,
      role: message.role,
      content: message.content,
      status: message.status || 'complete',
      created_at: now,
      sources_json: message.sources_json || null,
      search_metadata: message.search_metadata || null,
    };
    this.messages.set(record.id, record);

    // Update conversation timestamp
    const conv = this.conversations.get(message.conversation_id);
    if (conv) {
      conv.updated_at = now;
    }

    return record;
  }
}

// PostgreSQL Data Store Implementation with Automatic In-Memory Fallback
export class PostgresDataStore implements DataStore {
  constructor(private pool: Pool) {}

  async listConversations(ownerId: string, search?: string): Promise<ConversationRecord[]> {
    try {
      let querySql = `
        SELECT id, owner_id, title, created_at, updated_at
        FROM conversations
        WHERE owner_id = $1
      `;
      const params: (string | number)[] = [ownerId];

      if (search && search.length > 0) {
        params.push(`%${search}%`);
        querySql += ` AND title ILIKE $${params.length}`;
      }

      querySql += ` ORDER BY updated_at DESC`;
      const result = await this.pool.query<ConversationRecord>(querySql, params);
      return result.rows;
    } catch {
      return globalInMemoryStore.listConversations(ownerId, search);
    }
  }

  async createConversation(ownerId: string, title: string): Promise<ConversationRecord> {
    try {
      const result = await this.pool.query<ConversationRecord>(
        `
        INSERT INTO conversations (owner_id, title)
        VALUES ($1, $2)
        RETURNING id, owner_id, title, created_at, updated_at
        `,
        [ownerId, title || 'New Conversation']
      );
      return result.rows[0]!;
    } catch {
      return globalInMemoryStore.createConversation(ownerId, title);
    }
  }

  async getConversation(id: string, ownerId: string): Promise<ConversationRecord | null> {
    try {
      const result = await this.pool.query<ConversationRecord>(
        `SELECT id, owner_id, title, created_at, updated_at FROM conversations WHERE id = $1 AND owner_id = $2`,
        [id, ownerId]
      );
      return result.rows[0] || null;
    } catch {
      return globalInMemoryStore.getConversation(id, ownerId);
    }
  }

  async updateConversation(
    id: string,
    updates: { title?: string; updated_at?: string }
  ): Promise<void> {
    try {
      if (updates.title !== undefined) {
        await this.pool.query(
          `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
          [updates.title, id]
        );
      } else {
        await this.pool.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [id]);
      }
    } catch {
      await globalInMemoryStore.updateConversation(id, updates);
    }
  }

  async deleteConversation(id: string, ownerId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `DELETE FROM conversations WHERE id = $1 AND owner_id = $2 RETURNING id`,
        [id, ownerId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch {
      return globalInMemoryStore.deleteConversation(id, ownerId);
    }
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    try {
      const result = await this.pool.query<MessageRecord>(
        `
        SELECT id, conversation_id, role, content, status, created_at, sources_json, search_metadata
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        `,
        [conversationId]
      );
      return result.rows;
    } catch {
      return globalInMemoryStore.listMessages(conversationId);
    }
  }

  async insertMessage(message: {
    id?: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    status?: string;
    sources_json?: unknown;
    search_metadata?: unknown;
  }): Promise<MessageRecord> {
    try {
      const id = message.id || randomUUID();
      const result = await this.pool.query<MessageRecord>(
        `
        INSERT INTO messages (id, conversation_id, role, content, status, created_at, sources_json, search_metadata)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
        RETURNING id, conversation_id, role, content, status, created_at, sources_json, search_metadata
        `,
        [
          id,
          message.conversation_id,
          message.role,
          message.content,
          message.status || 'complete',
          message.sources_json ? JSON.stringify(message.sources_json) : null,
          message.search_metadata ? JSON.stringify(message.search_metadata) : null,
        ]
      );
      return result.rows[0]!;
    } catch {
      return globalInMemoryStore.insertMessage(message);
    }
  }
}

// Global in-memory singleton fallback
export const globalInMemoryStore = new InMemoryDataStore();
