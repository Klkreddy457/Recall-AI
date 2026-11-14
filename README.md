# Recall AI

A production-ready conversational chat agent with **exactly one tool (`web_search`)** that answers fast, maintains factual correctness, and reliably remembers what the user asked and when. Built without vector databases, SQLite, or an LLM classification router.

---

## Key Features

- **Exact Conversational Memory**: Recalls past user questions, entities, prices, and assistant answers across independent conversations and dates.
- **Dual-Timestamp Architecture**: Decouples actual database insertion timestamps (`created_at`) from explicitly discussed historical event dates (`event_date`), resolving historical date retrieval queries (e.g. November 3, November 9, November 10).
- **Natural Language Temporal Parsing**: Uses `chrono-node` to parse queries like *"yesterday"*, *"last Monday"*, and *"on November 3, 2026"* in the user's local IANA timezone to exact UTC ranges.
- **Parallel Retrieval Engine (No Router Call)**: Executes Recent Context, Temporal Search, Full-Text Search (PostgreSQL `websearch_to_tsquery`), and Conversation Summaries concurrently in under 2ms.
- **Single Tool Constraint & Search Budget**: Exactly one tool (`web_search`), with query normalization (`normalizeSearchQuery`), an in-turn search cache, and a hard cap of at most 1 search per turn.
- **Official Domain Prioritization & SEO Filter**: Boosts official vendor documentation (`hubspot.com`, `salesforce.com`, `neon.tech`, `supabase.com`, `railway.app`, etc.) and filters out quiz/puzzle/SEO mills (Wordle, Dropee, trivia scrapers).
- **Streaming Tool-Call JSON Sanitizer**: Uses balanced brace extraction (`extractValidJsonObject`) to repair concatenated or malformed streaming chunks (e.g. `{"query":"..."}{"query":"..."}`), eliminating `400 failed to template request: invalid character '{' after top-level value` errors.
- **Historical Change-Detection Engine**: Mathematically calculates price differences ($\Delta = \text{current} - \text{historical}$), percentage changes, 20-seat team totals, feature additions/removals, and flags non-comparable billing tiers.
- **Strict Citation Validation**: Parses `[n]` citations from assistant output; any citation not corresponding to verified backend results is stripped automatically.
- **Prompt Injection Defense**: Search results are treated as untrusted data and strictly isolated from system instructions.
- **Real-Time SSE Streaming**: Progressive token rendering with mid-stream `Stop` cancellation support via `AbortController`.
- **Date-Grouped Sidebar & Backend Search**: Search conversations dynamically with date grouping (Today, Yesterday, Previous 7 Days, Older).

---

## Technology Stack

- **Client**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React
- **Server**: Node.js, TypeScript (strict mode), Fastify
- **Database**: PostgreSQL 18 (hosted on Neon) via `pg` connection pool, SQL migrations, stored generated `tsvector`, GIN index, and PL/pgSQL triggers
- **LLM**: Groq / OpenAI-compatible SDK (streaming + function calling)
- **Search**: Tavily Search API (domain-boosted)
- **Validation**: Zod (fail-fast on startup and route inputs)
- **Tests**: Vitest

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **PostgreSQL**: Local PostgreSQL, Docker, or Neon PostgreSQL branch

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/Klkreddy457/Recall-AI.git
cd Recall-AI
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set the required environment variables:
```env
PORT=3001
HOST=0.0.0.0
CLIENT_ORIGIN=http://localhost:5173

# Database (PostgreSQL / Neon)
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require
DATABASE_SSL=true

# LLM & Search
OPENAI_API_KEY=your_llm_api_key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile
TAVILY_API_KEY=your_tavily_api_key

# Rate Limiting
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=1 minute
```

### 4. Run Database Migrations
```bash
npm run migrate
```
Applies migrations idempotently:
- `001_initial_schema.sql`: Core tables, GIN indexes, B-tree indexes.
- `002_conversation_summaries.sql`: Conversation summaries table and FTS trigger.
- `003_event_dates_and_metadata.sql`: Explicit `event_date` and index.

---

## Running the Application

### Development Mode (Client + Server concurrently)
```bash
npm run dev
```
- Client runs at: `http://localhost:5173`
- Server runs at: `http://localhost:3001`
- Server health endpoint: `http://localhost:3001/health`

### Production Build & Run
```bash
npm run build
npm run start
```

---

## Testing & Benchmarks

### 1. Unit & Integration Test Suite (Vitest)
Executes all 76 unit, integration, and failure reproduction tests across client and server workspaces:
```bash
npm run test
```

### 2. Comprehensive Agent Evaluation Benchmark Suite
Executes the complete 99-test evaluation benchmark across 7 testing categories:
```bash
npx tsx tests/evaluation/run-all.ts
```
Generates detailed reports in `docs/evaluation/`:
- `results.json`: Raw evaluation telemetry and metrics.
- `EVALUATION_REPORT.md`: Comprehensive evaluation findings.
- `PERFORMANCE_REPORT.md`: Measured p50/p95 latency distributions.
- `SECURITY_REPORT.md`: Prompt injection and tenant isolation audit.
- `report.html`: Visual HTML evaluation dashboard.

### 3. Production Database Verification
Verifies database connectivity, SSL encryption, triggers, and tenant isolation against Neon:
```bash
npx tsx server/scripts/production-verification.ts
```

---

## API Documentation

All conversation and chat routes require the `x-owner-id` header containing a valid UUID string to partition user data.

### Health Check
- **`GET /health`** or **`GET /api/health`**
  - Response: `200 OK` (when connected) or `503 Service Unavailable` (when disconnected)
  - Body: `{ "status": "ok", "db": "connected", "connected": true, "timestamp": "..." }`

### Conversations
- **`GET /api/conversations?search=optional_query`**
  - Scoped by `x-owner-id`. Returns conversations ordered by `updated_at DESC`.
- **`POST /api/conversations`**
  - Body: `{ "title": "Optional Title" }`. Returns created conversation (`201 Created`).
- **`DELETE /api/conversations/:id`**
  - Cascades delete to all associated messages. Returns `204 No Content` or `404 Not Found`.
- **`GET /api/conversations/:id/messages`**
  - Returns all messages in chronological order for the conversation.

### Chat (SSE Streaming)
- **`POST /api/chat`**
  - Headers:
    - `x-owner-id`: `<uuid>`
    - `Content-Type`: `application/json`
  - Body:
    ```json
    {
      "conversationId": "optional-uuid",
      "message": "What did I ask you on November 3, 2026?",
      "timezone": "America/New_York"
    }
    ```
  - Response: Server-Sent Events (`text/event-stream`):
    - `event: status` -> `{"type":"status","message":"Searching web..."}`
    - `event: token` -> `{"type":"token","content":"..."}`
    - `event: sources` -> `{"type":"sources","sources":[...]}`
    - `event: complete` -> `{"type":"complete","content":"...","sources":[...],"timings":{...},"status":"complete"}`
    - `event: error` -> `{"type":"error","error":"..."}`

---

## Deployment (Vercel & Neon)

### 1. Neon PostgreSQL Database
- Ensure migrations `001`, `002`, and `003` are applied:
  ```bash
  npm run migrate
  ```

### 2. Vercel Configuration
1. In the Vercel Dashboard, select project **recall-ai-app**.
2. Under **Settings -> Environment Variables**, configure:
   - `DATABASE_URL`: `postgresql://neondb_owner:***@ep-small-rain-azkilk1o-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - `DATABASE_SSL`: `true`
   - `OPENAI_API_KEY`: Groq API Key
   - `OPENAI_BASE_URL`: `https://api.groq.com/openai/v1`
   - `OPENAI_MODEL`: `llama-3.3-70b-versatile`
   - `TAVILY_API_KEY`: Tavily API Key
3. Deploy the latest commit on `main`.
4. Verify `GET https://recall-ai-app-six.vercel.app/api/health` returns `HTTP 200 OK` with `"connected": true`.

---

## Architectural Decisions & Trade-Offs

For an in-depth decision log and trade-off analysis, refer to [DESIGN.md](DESIGN.md).
