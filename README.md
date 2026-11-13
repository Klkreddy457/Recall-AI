# Recall AI

A chat agent with exactly one tool (`web_search`) that answers fast, gets facts right, and remembers what the user asked and when. Built without vector databases, SQLite, or an LLM classification router.

---

## Features

- **Exact Conversational Memory**: Remembers past user questions and assistant answers across conversations and dates.
- **Natural Language Temporal Parsing**: Uses `chrono-node` to parse queries like "yesterday", "last Monday", and "on 3 March" in the user's local IANA timezone to exact UTC ranges.
- **Parallel Retrieval (No Router Call)**: Executes Recent Context, Temporal Search, and Full-Text Search (PostgreSQL `websearch_to_tsquery`) in parallel SQL queries on every turn.
- **Single Tool Constraint**: Exactly one tool (`web_search`), with a hard-coded limit of at most 1 search per turn.
- **Strict Citation Validation**: Parses `[n]` citations from assistant output; any citation not corresponding to verified backend results is stripped automatically.
- **Prompt Injection Defense**: Search results are treated as untrusted data and strictly isolated from system instructions.
- **Real-Time SSE Streaming**: Progressive token rendering with mid-stream `Stop` cancellation support via `AbortController`.
- **Date-Grouped Sidebar & Backend Search**: Search conversations dynamically with date grouping (Today, Yesterday, Previous 7 Days, Older).

---

## Stack

- **Client**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React
- **Server**: Node.js, TypeScript (strict mode), Fastify
- **Database**: PostgreSQL 16 via `pg` connection pool, SQL migrations, stored generated `tsvector`, GIN index
- **LLM**: Official OpenAI SDK (`gpt-4o-mini`)
- **Search**: Tavily Search API
- **Validation**: Zod (fail-fast on startup and route inputs)
- **Tests**: Vitest

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **Docker**: Docker Desktop or Docker Engine (for local PostgreSQL)

### 2. Clone and Install Dependencies
```bash
git clone <repo-url> recall-ai
cd recall-ai
npm install
```

### 3. Start PostgreSQL Database
```bash
docker compose up -d
```
Verify the container is healthy:
```bash
docker ps --filter "name=recall_ai_postgres"
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and set your credentials:
```env
PORT=3001
HOST=0.0.0.0
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/recall_ai
DATABASE_SSL=false
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
TAVILY_API_KEY=your_tavily_api_key
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=1 minute
```

### 5. Run Database Migrations
```bash
npm run migrate
```
This runs the idempotent SQL migration runner in `server/src/db/migrate.ts`.

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

## Running Tests & Benchmarks

### 1. Test Suite (Vitest)
Runs all unit and integration tests across workspaces:
```bash
npm run test
```

### 2. Evaluation Suite (Reproducible Eval Dataset)
Runs the 15-case evaluation suite across 8 distinct categories (`general`, `time_sensitive`, `historical`, `follow_up`, `cross_conversation`, `unanswerable`, `search_failure`, `fts_hostile`):
```bash
npm run eval
```

### 3. Latency Benchmarks
Measures $N=20$ turns and writes percentile metrics (`p50`/`p95`) to `docs/benchmarks.md`:
```bash
npm run bench
```

### 4. SSE Smoke Test
Streams progressive tokens over a simulated live `curl -N` connection:
```bash
npm run smoke:curl --workspace=server
```

---

## API Documentation

All conversation and chat routes require the `x-owner-id` header containing a valid UUID string to partition user data.

### Health Check
- **`GET /health`**
  - Response: `200 OK`
  - Body: `{ "status": "ok", "db": "connected", "timestamp": "..." }`

### Conversations
- **`GET /api/conversations?search=optional_query`**
  - Scoped by `x-owner-id`.
  - Returns list of conversations ordered by `updated_at DESC`.
- **`POST /api/conversations`**
  - Body: `{ "title": "Optional Title" }`
  - Returns created conversation (status `201 Created`).
- **`DELETE /api/conversations/:id`**
  - Scoped by `x-owner-id`.
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
      "message": "What did we discuss yesterday?",
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

## Deployment

### Docker Deployment
Recall AI can be deployed on any container platform (Railway, Render, AWS ECS, Fly.io):
1. Provision a PostgreSQL 16 database.
2. Build the Docker container:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   COPY server/package*.json ./server/
   COPY client/package*.json ./client/
   RUN npm ci
   COPY . .
   RUN npm run build
   EXPOSE 3001
   CMD ["npm", "run", "start"]
   ```
3. Set environment variables from `.env.example`.
4. Run database migrations: `npm run migrate`.

---

## Limitations

1. **Pure FTS Lexical Gap**: Semantic categorization queries where the category keyword never appears in the text (e.g. *"Which companies did we discuss?"* when the messages discuss Stripe and Figma without using the word "company") cannot be resolved by pure full-text search.
2. **Single Search Limit**: The backend strictly limits each turn to 1 search call, preventing multi-hop iterative queries.
3. **Owner Header Isolation**: Data is scoped by `x-owner-id`, but this is data partitioning rather than authenticated cryptographic authorization.

---

## Screenshots

*(Placeholder for application user interface screenshots)*

```text
+---------------------------------------------------------------------------------+
| [R] Recall AI           |  Recall AI                                            |
| [+ New Chat]            |  Hybrid Memory + Search                               |
| [Search history...    ] |-------------------------------------------------------|
|                         |                                                       |
| TODAY                   |  User (10:14 AM)                                      |
| - Quantum Computing     |  What did we discuss yesterday about PostgreSQL?      |
|                         |                                                       |
| YESTERDAY               |  Assistant (10:14 AM)                                 |
| - Postgres Performance  |  Yesterday we discussed PostgreSQL GIN indexes and    |
|                         |  why relational FTS was chosen over vector databases. |
| PREVIOUS 7 DAYS         |                                                       |
| - Fastify Setup         |                                                       |
|                         |-------------------------------------------------------|
| [Light Mode]            | [ Ask anything or recall past discussions...   ] [Send] |
+---------------------------------------------------------------------------------+
```

