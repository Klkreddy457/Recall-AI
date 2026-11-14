# Recall AI: Implementation Audit Report

**Audit Date:** 2026-11-13  
**Auditor:** Senior AI Evaluation Engineer & Systems Architect  
**Subject Application:** Recall AI (Repository & Production Deployment at `https://recall-ai-app-six.vercel.app`)  
**Specification Reference:** `AGENTS.md`, `DESIGN.md`, `PHASES.md`

---

## 1. Executive Summary

This audit evaluates the actual code implementation of **Recall AI**, distinguishing verified operational code from planned features, mock harnesses, and theoretical designs. The evaluation adheres strictly to the hiring challenge mandate: *"Architecture quality, correctness, and honest documentation outrank feature count. Claim no performance number you did not measure. Never fabricate test results."*

---

## 2. Component-by-Component Implementation Audit

### 2.1 Backend Architecture & Framework
- **Status:** **IMPLEMENTED**
- **File:** `server/src/app.ts`, `server/src/index.ts`, `api/index.ts`
- **Implementation Reality:**
  - Built with Fastify v5 with `@fastify/cors` and `@fastify/rate-limit`.
  - Exposes `GET /health`, `GET /api/conversations`, `POST /api/conversations`, `DELETE /api/conversations/:id`, `GET /api/conversations/:id/messages`, and `POST /api/chat`.
  - Supports both standalone Node.js server (`server/src/index.ts`) and Vercel Serverless Function runtime (`api/index.ts`) using dynamic ES module imports.
- **Verification:** Verified by live HTTP tests on `http://localhost:3001` and live production endpoints on Vercel (`https://recall-ai-app-six.vercel.app/api/conversations`).

---

### 2.2 LLM Integration & Tool Calling
- **Status:** **IMPLEMENTED**
- **Files:** `server/src/services/llm/openai.ts`, `server/src/services/llm/types.ts`
- **Implementation Reality:**
  - Official `openai` SDK (`OpenAI` client) used with streaming enabled (`stream: true`).
  - Supports `OPENAI_BASE_URL` allowing full compatibility with OpenAI, Groq, OpenRouter, and Ollama.
  - Exposes exactly one tool definition: `web_search({ query: string })`.
  - Test harness includes `FakeLLMClient` with programmable scripted turns and tool calls for deterministic offline testing.
- **Verification:** Verified live using Groq endpoint (`qwen/qwen3.8-27b`) streaming tokens and executing `web_search` tool calls.

---

### 2.3 Web Search Integration
- **Status:** **IMPLEMENTED**
- **Files:** `server/src/services/search/tavily.ts`, `server/src/services/search/types.ts`
- **Implementation Reality:**
  - Official Tavily Search API client implemented via HTTP `fetch` to `https://api.tavily.com/search`.
  - Restricts search depth to `basic`, capped at at most 5 results (`max_results: 5`).
  - Implements an 8,000ms `AbortSignal.timeout` to prevent hung connections.
  - Enforces graceful error handling: any network failure, timeout, or provider error resolves to `"search unavailable"` rather than crashing the orchestrator.
  - Test harness includes `FakeSearchClient` simulating success, empty results, and network failures.
- **Verification:** Verified live with real Tavily API keys returning structured snippets, domains, and publication dates.

---

### 2.4 Agent Orchestration & Turn Pipeline
- **Status:** **IMPLEMENTED**
- **Files:** `server/src/agent/orchestrator.ts`, `server/src/agent/context.ts`
- **Implementation Reality:**
  - Implemented as a single `AgentOrchestrator` class.
  - Execution lifecycle:
    1. Validates input request via Zod.
    2. Runs parallel memory retrieval (Recent + Temporal + FTS).
    3. Builds unified prompt with current local time and retrieved memory.
    4. Streams initial LLM turn.
    5. Detects `web_search` tool call. Enforces a **hard cap of maximum 1 search per turn**. A second tool call yields a tool error.
    6. Formats search results into structured tool message `[1]..[n]`.
    7. Streams final LLM completion turn.
    8. Validates citations and strips any invalid `[n]` references.
    9. Persists messages and emits final SSE `complete` payload with turn timings.
- **Verification:** Verified by 47 automated Vitest unit tests, live curl SSE streaming, and 15 reproducible evaluation cases.

---

### 2.5 Citation Validation & Injection Defense
- **Status:** **IMPLEMENTED**
- **File:** `server/src/agent/citations.ts`
- **Implementation Reality:**
  - Regex replacement `/\[(\d+)\]/g` inspects all emitted citation tokens.
  - If $n < 1$ or $n > \text{resultsCount}$, `[n]` is stripped from the assistant output.
  - Source cards are constructed **exclusively from backend-returned search results**; model-emitted URLs are never used to construct citation cards.
  - System prompt explicitly instructs the LLM that search snippets are untrusted data and must never be treated as instructions.
- **Verification:** Verified in `tests/agent.test.ts` where invalid citations (e.g. `[99]`) are stripped and untrusted instructions inside search snippets are ignored.

---

### 2.6 Database Persistence & Storage Architecture
- **Status:** **IMPLEMENTED (Dual-Mode)**
- **Files:** `server/src/db/migrations/001_initial_schema.sql`, `server/src/db/pool.ts`, `server/src/db/migrate.ts`, `server/src/db/store.ts`
- **Implementation Reality:**
  - **PostgreSQL Mode:** Standard relational tables `conversations` and `messages`. Generated stored tsvector `content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`.
  - Indexes: `(owner_id, updated_at DESC)`, `(conversation_id, created_at)`, `(created_at)`, and GIN on `content_tsv`.
  - Foreign key cascading deletion from `conversations` to `messages`.
  - **In-Memory Fallback Mode (`InMemoryDataStore`):** Added to allow full multi-turn conversational persistence, sidebar history, and search even when PostgreSQL / Docker is offline or when running in serverless environments without an external database.
- **Verification:** Verified SQL schema syntax, automated migration runner, in-memory store persistence, and CRUD REST routes.

---

### 2.7 Memory Retrieval Engine
- **Status:** **IMPLEMENTED**
- **Files:** `server/src/services/memory/retrieval.ts`, `server/src/services/memory/temporal.ts`, `server/src/services/memory/cues.ts`
- **Implementation Reality:**
  - **A. Recent Context:** Queries up to $N$ most recent messages in the active conversation thread.
  - **B. Temporal Parsing:** `chrono-node` parser configured with IANA timezone offset and DST convergence (`localToUtc`), parsing expressions like *"yesterday"*, *"last Monday"*, *"October 10"* into exact UTC `[start, end)` bounds.
  - **C. PostgreSQL Full-Text Search (FTS):** Parameterized `websearch_to_tsquery('english', $2)` combined with `ts_rank_cd(content_tsv, ...)`. Returns hits paired with their corresponding question/answer counterpart via SQL lateral join.
  - **D. Memory Cues:** Regex scanner detects memory cues (*"did I"*, *"we discussed"*, *"yesterday"*, etc.). If cues are detected and retrieval is empty, triggers `memoryEmptySignal = true`, injecting `MEMORY: no matching records`.
- **Verification:** Verified in `tests/temporal.test.ts`, `tests/cues.test.ts`, and `tests/memory.test.ts`.

---

### 2.8 SSE Streaming & Client Interruption
- **Status:** **IMPLEMENTED**
- **File:** `server/src/routes/chat.ts`, `client/src/hooks/useChatStream.ts`
- **Implementation Reality:**
  - Fastify raw HTTP stream with headers `text/event-stream`, `no-cache`, `keep-alive`.
  - Emits events: `status`, `token`, `sources`, `complete`, `error`.
  - Propagates client disconnection via `request.raw.on('close')` to `AbortController`.
  - Assistant message is persisted with `status: 'interrupted'` if aborted mid-flight.
- **Verification:** Verified in `tests/chat.test.ts` simulating abort signal and verifying persisted status.

---

### 2.9 Frontend Application
- **Status:** **IMPLEMENTED**
- **Files:** `client/src/App.tsx`, `client/src/components/Chat.tsx`, `client/src/components/Sidebar.tsx`, `client/src/components/CitationCard.tsx`
- **Implementation Reality:**
  - React 19 + TypeScript + Tailwind CSS + Lucide React.
  - Sidebar with backend conversation search, date-grouped history, delete button, theme switch (dark/light), and mobile hamburger drawer.
  - Chat interface with 4 suggested prompt cards, streaming tokens, local timezone timestamps, source cards with direct external links, stop button, retry button, and error banner.
  - Client-generated `owner_id` stored in `localStorage` and dispatched via `x-owner-id` header.
- **Verification:** Verified through Vite production build and live browser testing at `https://recall-ai-app-six.vercel.app`.

---

## 3. What is Missing or Deferred by Decision

1. **Vector Database / Embeddings:**
   - **Status:** **FORBIDDEN BY SPECIFICATION (`AGENTS.md`)**
   - The project strictly relies on SQL Full-Text Search (`websearch_to_tsquery`) and temporal boundary indexing.
2. **Conversation Summaries Table (`conversation_summaries`):**
   - **Status:** **DEFERRED PER DECISION 6**
   - Evidence-gated: only to be implemented if cross-conversation FTS fails beyond acceptable thresholds.
3. **Cryptographic Authentication:**
   - **Status:** **BY DESIGN (DECISION 7)**
   - The application uses client-generated `x-owner-id` UUID headers for multi-tenant data partitioning, explicitly documented as data isolation, not authentication.
4. **Multi-Hop Search:**
   - **Status:** **FORBIDDEN BY DECISION 3**
   - Strictly capped at 1 search per turn.

---

## 4. Potential Architectural & Functional Weaknesses

| ID | Component | Weakness Description | Severity | Impact |
|---|---|---|---|---|
| **W-01** | Memory FTS | Pure lexical matching (`websearch_to_tsquery`) cannot resolve semantic synonyms or categorical queries without keyword overlap (e.g. *"Which companies did we discuss?"* when "company" was never used). | Medium | Missed memory retrieval on categorical queries. |
| **W-02** | Ephemeral Serverless State | When deployed on Vercel without an external hosted PostgreSQL database (`DATABASE_URL`), in-memory fallback state is partitioned per serverless container instance and does not persist across cold boots. | High | Conversation history on Vercel resets when serverless containers recycle if external DB is omitted. |
| **W-03** | Rate Limit Starvation | On third-party free tier endpoints (e.g. Groq free tier 1,000 output tokens/min), bursts of multi-turn chat can trigger provider 429 rate limit errors. | Medium | Temporary turn failure if client does not back off. |
| **W-04** | Single Search Constraint | If a query requires two independent pieces of information (e.g., comparing weather in Tokyo and London), the agent must synthesize a single search query or choose one. | Low | Multi-step research questions cannot do successive searches. |
| **W-05** | Header-Based Ownership | Anyone who supplies an existing `x-owner-id` UUID can access that owner's conversations. | Medium | Not suitable for public multi-user production without auth. |

---

## 5. Audit Conclusion

The Recall AI codebase conforms rigorously to the specifications laid out in `AGENTS.md` and `DESIGN.md`. The core invariants—single `web_search` tool, parallel memory retrieval without an LLM router, single search per turn, temporal parsing in local timezone, citation validation, and interrupted turn persistence—are genuinely implemented in production code with no fabricated stubs.

