import type { Pool } from 'pg';
import { parseTemporalDate } from './temporal.js';
import { hasMemoryCue } from './cues.js';
import type {
  RetrieveOptions,
  MemoryRetrievalResult,
  MessageRecord,
  QAPair,
  TemporalRetrievalResult,
  TemporalConversationGroup,
} from './types.js';

export function extractFtsSearchTerms(query: string): string {
  if (!query || typeof query !== 'string') return '';

  const fillerPatterns = [
    /\b(what|when|where|which|who|why|how)\s+(did|do|does|was|were|is|are|can|could|would|should)\b/gi,
    /\b(did|do|does|was|were|have|has|had)\s+(i|we|you)\b/gi,
    /\b(we|i)\s+(discussed|talked\s+about|covered|mentioned|compared|asked|learned)\b/gi,
    /\b(tell\s+me\s+about|show\s+me|give\s+me|summarize|recall|remember|do\s+you\s+remember)\b/gi,
    /\b(earlier|before|previously|last\s+time|in\s+the\s+past|prior|first\s+topic|topic)\b/gi,
    /\b(what\s+about|what\s+was\s+my|what\s+were\s+the|which\s+ones)\b/gi,
    /\b(in\s+our\s+previous|in\s+our\s+past|our\s+conversation)\b/gi,
  ];

  let cleaned = query;
  for (const pat of fillerPatterns) {
    cleaned = cleaned.replace(pat, ' ');
  }

  // Remove punctuation except alphanumeric and spaces
  cleaned = cleaned.replace(/[?.,!;:()"'`]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned;
}

export async function retrieve(pool: Pool, options: RetrieveOptions): Promise<MemoryRetrievalResult> {
  const {
    ownerId,
    query,
    activeConversationId,
    timezone = 'UTC',
    limitRecent = 10,
    limitFts = 5,
    now = new Date(),
  } = options;

  const totalStart = performance.now();
  let recentMs = 0;
  let temporalMs = 0;
  let ftsMs = 0;

  // A. Recent Context Retrieval
  const runRecent = async (): Promise<MessageRecord[]> => {
    const start = performance.now();
    try {
      if (!activeConversationId) return [];

      const result = await pool.query<MessageRecord>(
        `
        SELECT m.id, m.conversation_id, m.role, m.content, m.status, m.created_at,
               m.sources_json, m.search_metadata, c.title as conversation_title
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = $1 AND c.owner_id = $2
        ORDER BY m.created_at DESC
        LIMIT $3
        `,
        [activeConversationId, ownerId, limitRecent]
      );

      // Return chronological order (oldest to newest)
      return result.rows.reverse();
    } finally {
      recentMs = performance.now() - start;
    }
  };

  // B. Temporal Retrieval
  const runTemporal = async (): Promise<TemporalRetrievalResult | null> => {
    const start = performance.now();
    try {
      const dateRange = parseTemporalDate(query, timezone, now);
      if (!dateRange) return null;

      const result = await pool.query<{
        user_id: string;
        conversation_id: string;
        user_role: 'user';
        user_content: string;
        user_status: string | null;
        user_created_at: Date;
        user_sources_json: unknown;
        user_search_metadata: unknown;
        conversation_title: string | null;
        assistant_id: string | null;
        assistant_role: 'assistant' | null;
        assistant_content: string | null;
        assistant_status: string | null;
        assistant_created_at: Date | null;
        assistant_sources_json: unknown;
        assistant_search_metadata: unknown;
      }>(
        `
        WITH user_msgs AS (
          SELECT m.id, m.conversation_id, m.role, m.content, m.status, m.created_at,
                 m.sources_json, m.search_metadata, c.title as conversation_title
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE c.owner_id = $1
            AND m.role = 'user'
            AND m.created_at >= $2
            AND m.created_at < $3
          ORDER BY m.created_at ASC
        )
        SELECT u.id as user_id, u.conversation_id, u.role as user_role, u.content as user_content,
               u.status as user_status, u.created_at as user_created_at, u.sources_json as user_sources_json,
               u.search_metadata as user_search_metadata, u.conversation_title,
               a.id as assistant_id, a.role as assistant_role, a.content as assistant_content,
               a.status as assistant_status, a.created_at as assistant_created_at,
               a.sources_json as assistant_sources_json, a.search_metadata as assistant_search_metadata
        FROM user_msgs u
        LEFT JOIN LATERAL (
          SELECT m.id, m.role, m.content, m.status, m.created_at, m.sources_json, m.search_metadata
          FROM messages m
          WHERE m.conversation_id = u.conversation_id
            AND m.role = 'assistant'
            AND m.created_at >= u.created_at
          ORDER BY m.created_at ASC
          LIMIT 1
        ) a ON true
        ORDER BY u.created_at ASC
        `,
        [ownerId, dateRange.start, dateRange.end]
      );

      if (result.rows.length === 0) {
        return { range: dateRange, groups: [] };
      }

      // Group pairs by conversation_id
      const groupMap = new Map<string, TemporalConversationGroup>();

      for (const row of result.rows) {
        const userMsg: MessageRecord = {
          id: row.user_id,
          conversation_id: row.conversation_id,
          role: 'user',
          content: row.user_content,
          status: row.user_status,
          created_at: row.user_created_at,
          sources_json: row.user_sources_json,
          search_metadata: row.user_search_metadata,
          conversation_title: row.conversation_title,
        };

        let assistantMsg: MessageRecord | undefined;
        if (row.assistant_id) {
          assistantMsg = {
            id: row.assistant_id,
            conversation_id: row.conversation_id,
            role: 'assistant',
            content: row.assistant_content!,
            status: row.assistant_status,
            created_at: row.assistant_created_at!,
            sources_json: row.assistant_sources_json,
            search_metadata: row.assistant_search_metadata,
            conversation_title: row.conversation_title,
          };
        }

        const pair: QAPair = {
          conversationId: row.conversation_id,
          conversationTitle: row.conversation_title,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
        };

        let group = groupMap.get(row.conversation_id);
        if (!group) {
          group = {
            conversationId: row.conversation_id,
            conversationTitle: row.conversation_title,
            pairs: [],
          };
          groupMap.set(row.conversation_id, group);
        }
        group.pairs.push(pair);
      }

      return {
        range: dateRange,
        groups: Array.from(groupMap.values()),
      };
    } finally {
      temporalMs = performance.now() - start;
    }
  };

  // C. Full-Text Search (FTS) Retrieval
  const runFts = async (): Promise<QAPair[]> => {
    const start = performance.now();
    try {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return [];

      const cleanedTerms = extractFtsSearchTerms(trimmedQuery);

      const result = await pool.query<{
        hit_id: string;
        conversation_id: string;
        hit_role: 'user' | 'assistant';
        hit_content: string;
        hit_status: string | null;
        hit_created_at: Date;
        rank: number;
        conversation_title: string | null;
        hit_sources_json: unknown;
        hit_search_metadata: unknown;
        paired_id: string | null;
        paired_role: 'user' | 'assistant' | null;
        paired_content: string | null;
        paired_status: string | null;
        paired_created_at: Date | null;
        paired_sources_json: unknown;
        paired_search_metadata: unknown;
      }>(
        `
        WITH hits AS (
          SELECT m.id, m.conversation_id, m.role, m.content, m.status, m.created_at,
                 m.sources_json, m.search_metadata,
                 GREATEST(
                   ts_rank_cd(m.content_tsv, websearch_to_tsquery('english', $2)),
                   CASE WHEN $4 != '' THEN ts_rank_cd(m.content_tsv, plainto_tsquery('english', $4)) ELSE 0 END
                 ) as rank,
                 c.title as conversation_title
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE c.owner_id = $1
            AND (
              m.content_tsv @@ websearch_to_tsquery('english', $2)
              OR ($4 != '' AND m.content_tsv @@ plainto_tsquery('english', $4))
            )
          ORDER BY rank DESC, m.created_at DESC
          LIMIT $3 * 2
        )
        SELECT h.id as hit_id, h.conversation_id, h.role as hit_role, h.content as hit_content,
               h.status as hit_status, h.created_at as hit_created_at, h.rank, h.conversation_title,
               h.sources_json as hit_sources_json, h.search_metadata as hit_search_metadata,
               p.id as paired_id, p.role as paired_role, p.content as paired_content,
               p.status as paired_status, p.created_at as paired_created_at,
               p.sources_json as paired_sources_json, p.search_metadata as paired_search_metadata
        FROM hits h
        LEFT JOIN LATERAL (
          SELECT m.id, m.role, m.content, m.status, m.created_at, m.sources_json, m.search_metadata
          FROM messages m
          WHERE m.conversation_id = h.conversation_id
            AND (
              (h.role = 'user' AND m.role = 'assistant' AND m.created_at >= h.created_at)
              OR
              (h.role = 'assistant' AND m.role = 'user' AND m.created_at <= h.created_at)
            )
          ORDER BY CASE WHEN h.role = 'user' THEN m.created_at END ASC,
                   CASE WHEN h.role = 'assistant' THEN m.created_at END DESC
          LIMIT 1
        ) p ON true
        ORDER BY h.rank DESC
        `,
        [ownerId, trimmedQuery, limitFts, cleanedTerms]
      );

      const pairs: QAPair[] = [];
      const seenPairKeys = new Set<string>();

      for (const row of result.rows) {
        let userMsg: MessageRecord;
        let assistantMsg: MessageRecord | undefined;

        if (row.hit_role === 'user') {
          userMsg = {
            id: row.hit_id,
            conversation_id: row.conversation_id,
            role: 'user',
            content: row.hit_content,
            status: row.hit_status,
            created_at: row.hit_created_at,
            sources_json: row.hit_sources_json,
            search_metadata: row.hit_search_metadata,
            conversation_title: row.conversation_title,
          };
          if (row.paired_id) {
            assistantMsg = {
              id: row.paired_id,
              conversation_id: row.conversation_id,
              role: 'assistant',
              content: row.paired_content!,
              status: row.paired_status,
              created_at: row.paired_created_at!,
              sources_json: row.paired_sources_json,
              search_metadata: row.paired_search_metadata,
              conversation_title: row.conversation_title,
            };
          }
        } else {
          // Hit is assistant
          assistantMsg = {
            id: row.hit_id,
            conversation_id: row.conversation_id,
            role: 'assistant',
            content: row.hit_content,
            status: row.hit_status,
            created_at: row.hit_created_at,
            sources_json: row.hit_sources_json,
            search_metadata: row.hit_search_metadata,
            conversation_title: row.conversation_title,
          };
          if (row.paired_id) {
            userMsg = {
              id: row.paired_id,
              conversation_id: row.conversation_id,
              role: 'user',
              content: row.paired_content!,
              status: row.paired_status,
              created_at: row.paired_created_at!,
              sources_json: row.paired_sources_json,
              search_metadata: row.paired_search_metadata,
              conversation_title: row.conversation_title,
            };
          } else {
            // Fallback user message representation if assistant was orphaned
            userMsg = {
              id: `unpaired-${row.hit_id}`,
              conversation_id: row.conversation_id,
              role: 'user',
              content: '',
              status: null,
              created_at: row.hit_created_at,
              conversation_title: row.conversation_title,
            };
          }
        }

        const pairKey = `${userMsg.id}-${assistantMsg?.id ?? 'none'}`;
        if (!seenPairKeys.has(pairKey)) {
          seenPairKeys.add(pairKey);
          pairs.push({
            conversationId: row.conversation_id,
            conversationTitle: row.conversation_title,
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            rank: Number(row.rank),
          });
        }

        if (pairs.length >= limitFts) break;
      }

      return pairs;
    } catch {
      // If websearch_to_tsquery has no search terms (e.g. only symbols), return empty list safely
      return [];
    } finally {
      ftsMs = performance.now() - start;
    }
  };

  // Run A, B, C in parallel (Decision 2)
  const [recentContext, temporal, ftsRaw] = await Promise.all([
    runRecent(),
    runTemporal(),
    runFts(),
  ]);

  // Exclude FTS hits whose user messages or assistant messages are already in recent context A
  const recentMsgIds = new Set(recentContext.map((m) => m.id));
  const fts = ftsRaw.filter(
    (p) =>
      !recentMsgIds.has(p.userMessage.id) &&
      (!p.assistantMessage || !recentMsgIds.has(p.assistantMessage.id))
  );

  // Decision 5: Memory-intent cue detection & empty signal
  const cuePresent = hasMemoryCue(query);
  const temporalHasHits = temporal !== null && temporal.groups.length > 0;
  const ftsHasHits = fts.length > 0;

  // Signal empty memory only when user expressed memory intent and retrieval produced zero matching historical records
  const memoryEmptySignal = cuePresent && !temporalHasHits && !ftsHasHits;

  const totalMs = performance.now() - totalStart;

  return {
    recentContext,
    temporal,
    fts,
    memoryEmptySignal,
    timings: {
      totalMs: Math.round(totalMs * 100) / 100,
      recentMs: Math.round(recentMs * 100) / 100,
      temporalMs: Math.round(temporalMs * 100) / 100,
      ftsMs: Math.round(ftsMs * 100) / 100,
    },
  };
}

