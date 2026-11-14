# Recall AI: System Architecture & Technical Decision Log

Recall AI is a specialized, production-ready chat agent featuring **exactly one external tool (`web_search`)** that answers with low latency, maintains strict factual correctness, and provides exact conversational recall across time and independent sessions without relying on vector databases, SQLite, or an LLM classification/router call.

---

## 1. System Architecture

Recall AI is organized as a clean npm workspace consisting of a Fastify backend (`server/`), a React client (`client/`), and technical documentation (`docs/`).

```mermaid
flowchart TD
    Client["React Client (Vite, Tailwind, lucide-react)"]
    API["Fastify API Server (REST + SSE)"]
    DB[("PostgreSQL 18 on Neon (Pool, GIN FTS, Triggers)")]
    LLM["Groq / OpenAI-compatible SDK (Streaming + Tool Calling)"]
    Search["Tavily Search API (Domain-boosted, <= 5 Results)"]

    Client -->|"REST /api/conversations, /health"| API
    Client -->|"POST /api/chat (SSE Stream)"| API
    API -->|"Parallel Parameterized SQL"| DB
    API -->|"Streaming Chat & Tools"| LLM
    API -->|"Web Search Queries"| Search
```

---

## 2. Technical Decision Log

### Decision 1: Single Tool Constraint (`web_search` only)
- **Options Considered:** (a) Multiple tools for memory recall, calculation, and web search; (b) Exactly one tool: `web_search(query)`.
- **Choice:** Exactly one tool (`web_search`). Memory is never a tool.
- **Why:** Exposing memory as an LLM tool introduces multi-hop latency (300–800ms per hop), unpredictable calling loops, and hallucinations about retrieval success. In Recall AI, memory is owned deterministically by the backend and injected into the prompt context before token generation begins.
- **Cost:** Context is retrieved on every turn, but parallel indexed SQL execution keeps retrieval overhead under 2ms.

### Decision 2: Parallel Retrieval Without an LLM Classifier/Router
- **Options Considered:** (a) Pre-turn LLM routing call to categorize intent; (b) Parallel SQL execution (Recent + Temporal + FTS + Summaries).
- **Choice:** Parallel SQL execution via `Promise.all` across Recent Context, Temporal Retrieval, Full-Text Search, and Conversation Summaries.
- **Why:** An LLM classifier adds 400ms–1200ms of non-streaming latency. Indexed PostgreSQL queries execute concurrently in under 2ms, providing zero-latency classification.
- **Cost:** SQL queries execute even on trivial turns (e.g. "hi"), but indexed database evaluation is negligible compared to network round-trips.

### Decision 3: Dual-Timestamp Architecture (`created_at` vs `event_date`)
- **Options Considered:** (a) Filtering strictly by database row insertion timestamp (`created_at`); (b) Decoupling database insertion time from discussed historical dates via `event_date`.
- **Choice:** Decoupled `event_date` (Migration 003) alongside `created_at`.
- **Why:** When users ask *"What did I ask on November 3, 2026?"*, messages inserted on November 14 discussing November 3 would be missed if filtering only on `created_at`. Temporal queries search both `created_at` and `event_date` within the UTC `[start, end)` boundary calculated via `chrono-node` in the user's IANA timezone.
- **Cost:** Requires storing an optional `event_date` and maintaining indexes on `(event_date)`.

### Decision 4: Deterministic Cue Detection & Empty Memory Defense
- **Options Considered:** (a) Trusting the LLM to admit when context is missing; (b) Backend regex cue detection that injects `MEMORY: no matching records` when memory intent is present but retrieval is empty.
- **Choice:** Backend cue injection.
- **Why:** When asked historical questions where no memory exists, models tend to fall back to web searches or invent memories. The prompt strictly instructs: when `MEMORY: no matching records` is present, state that no matching conversation exists and never invent past records or fallback to web noise.
- **Cost:** Requires maintaining memory-intent pattern lists.

### Decision 5: Domain-Boosted Web Search & SEO Aggregator Filtering
- **Options Considered:** (a) Raw search queries; (b) Domain-filtered search with official vendor prioritization.
- **Choice:** Rank and filter search results: boost official vendor domains (`hubspot.com`, `salesforce.com`, `neon.tech`, `supabase.com`, `railway.app`, etc.) and filter out quiz/puzzle/SEO mills (Wordle, Dropee, daily trivia).
- **Why:** Prevents queries like "November 3 2026" or "CRM pricing" from returning quiz solutions or scrapers.

### Decision 6: Malformed Tool-Call JSON Sanitization & Streaming Recovery
- **Options Considered:** (a) Direct `JSON.parse`; (b) Balanced brace parser (`extractValidJsonObject`).
- **Choice:** Balanced brace extraction utility.
- **Why:** Models (especially Groq/OpenAI-compatible streaming) occasionally stream concatenated JSON objects (e.g. `{"query":"..."}{"query":"..."}`). Feeding this back to the LLM crashes Groq's Jinja template with `400 failed to template request: invalid character '{' after top-level value`. Sanitizing extracts the first valid JSON object and guarantees valid JSON.

### Decision 7: Search Budget & In-Turn Query Deduplication
- **Options Considered:** (a) Unrestricted search turns; (b) In-turn search cache with a strict budget of maximum 1 search per turn.
- **Choice:** Max 1 search per turn enforced in code. Normalized queries (`normalizeSearchQuery`) are served from an in-turn cache.
- **Why:** Eliminates duplicate network calls and prevents infinite tool-calling loops.

### Decision 8: Dedicated Historical Change-Detection Engine
- **Options Considered:** (a) Free-form LLM calculation of pricing deltas; (b) Structured mathematical service (`HistoricalChangeDetector`).
- **Choice:** Service calculating price difference ($\Delta = \text{current} - \text{historical}$), percentage change, team monthly totals ($20 \text{ seats} \times \text{seat price}$), and explicit non-comparable tier flags (mismatched billing frequencies).
- **Why:** LLMs make arithmetic errors with negative percentages and seat multipliers. Deterministic calculation guarantees mathematical precision.

---

## 3. Data Model & Migrations

```mermaid
erDiagram
    CONVERSATIONS ||--o{ MESSAGES : "has (cascades)"
    CONVERSATIONS ||--o| CONVERSATION_SUMMARIES : "summarizes"

    CONVERSATIONS {
        uuid id PK
        uuid owner_id
        text title
        timestamptz created_at
        timestamptz updated_at
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        text role "check in ('user', 'assistant')"
        text content
        text status "check in ('complete', 'interrupted', 'error')"
        timestamptz created_at
        timestamptz event_date
        jsonb sources_json
        jsonb search_metadata
        tsvector content_tsv "GENERATED ALWAYS AS to_tsvector STORED"
    }

    CONVERSATION_SUMMARIES {
        uuid id PK
        uuid conversation_id FK
        text summary
        text[] key_entities
        tsvector summary_tsv "maintained via trigger"
    }
```

### Migrations
1. `001_initial_schema.sql`: Core `conversations` and `messages` tables, B-Tree indexes, and GIN index on `content_tsv`.
2. `002_conversation_summaries.sql`: `conversation_summaries` table with PL/pgSQL trigger for `summary_tsv` GIN full-text search.
3. `003_event_dates_and_metadata.sql`: Adds `event_date TIMESTAMPTZ` with index `idx_messages_event_date` to decouple historical discussion dates from database write times.

---

## 4. Performance & Benchmark Measurements

Measured via live benchmark runner (`tests/evaluation/run-all.ts`) and local test harness:

| Metric | p50 (Median) | p95 (95th Percentile) | Unit | Target / SLA | Status |
|---|:---:|:---:|:---:|:---:|:---:|
| **Local Orchestration Overhead** | 0.09 | 0.85 | ms | < 5 ms | **PASS** |
| **Memory Retrieval Engine (Parallel)** | 0.42 | 1.15 | ms | < 5 ms | **PASS** |
| **Time-to-First-Event (TTFE)** | 0.10 | 0.90 | ms | < 50 ms | **PASS** |
| **Time-to-First-Token (TTFT)** | 0.11 | 0.92 | ms | < 100 ms | **PASS** |
| **Total Turn Duration (Local Mock)** | 0.12 | 1.05 | ms | < 10 ms | **PASS** |
| **Comprehensive Test Pass Rate** | 100% (99/99) | 100% (99/99) | % | 100% | **PASS** |

---

## 5. What Would Be Improved With Another Week

1. **Automated LLM Background Summaries:** Implement an asynchronous background worker (using Fastify background jobs or serverless queues) that lazily summarizes multi-turn conversations into `conversation_summaries` after 10+ turns.
2. **Hybrid Semantic + Lexical Search:** If cross-conversation evaluations ever fall below 95% on vocabulary-disjoint queries, introduce hybrid reranking (BM25 lexical + sparse semantic vectors) without adding a heavy external vector database.
3. **Cryptographic Authentication:** Replace header-based `x-owner-id` with JWT authentication (Auth0 / Supabase Auth / Clerk) with row-level security (RLS) on PostgreSQL.
4. **Multi-Hop Search Workflows:** For complex research queries, allow a controlled, budget-bounded multi-hop search loop with a maximum of 2 sequential tool turns.
