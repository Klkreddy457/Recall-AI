# PHASES.md: Recall AI task prompts

**How to use:** put `AGENTS.md` in the repo root (Claude Code reads `CLAUDE.md`, so also run `cp AGENTS.md CLAUDE.md`, or add a `CLAUDE.md` containing `@AGENTS.md`). Paste ONE phase prompt at a time. Do not move on until the exit check is green and committed.

---

## Phase 0: Kickoff

```
Read AGENTS.md fully. Inspect the workspace and tell me what exists.
Then write a plan of at most 40 lines covering the repo layout, the
module boundaries, and any decision in AGENTS.md you think is risky
(with a one-line reason). Do not write code yet.
```

**Exit check:** plan matches AGENTS.md; no new frameworks introduced.

---

## Phase 1: Backend foundation + schema

```
Implement Phase 1 from AGENTS.md:
- npm workspaces, strict TS, Fastify app factory (buildApp) so tests can use inject
- env config validated with Zod (fail fast on missing vars)
- pg Pool with sane limits and DATABASE_SSL support
- SQL migrations + a tiny migration runner (npm run migrate), idempotent
- schema exactly as in AGENTS.md (generated tsvector, GIN + btree indexes)
- docker-compose.yml for local Postgres
- REST: GET /health (checks DB), GET/POST/DELETE conversations, GET messages.
  All scoped by owner_id header. Zod on inputs, body limit, CORS, error handler.
- Vitest setup against a real Postgres test database
Add tests: migrations run on a clean DB, owner isolation, cascade delete.
Run build + tests, show the output, then commit.
```

**Exit check:** migrations succeed on an empty DB; tests green.

---

## Phase 2: Memory engine

```
Implement the memory service (server/src/services/memory):
- chrono-node date parsing in the user's IANA timezone -> [start,end) UTC.
  Handle: yesterday, last Monday, last week, "on 3 March".
- recent-context, temporal, and FTS retrieval exactly as in AGENTS.md
  (FTS returns Q&A pairs, dedupes against recent context)
- memory-intent cue detection (decision 5) and the
  "MEMORY: no matching records" signal
- retrieve() runs A, B, C in parallel and returns a typed result with timings
Tests (real Postgres): topic retrieval, yesterday/last-Monday with exact
timestamps, a non-UTC timezone, a DST boundary, cross-conversation isolation,
owner isolation, empty-retrieval signal.
Run tests, show output, commit.
```

**Exit check:** the date tests pass in at least two timezones.

---

## Phase 3: Agent orchestrator

```
Implement the agent:
- LLMClient and SearchClient interfaces. OpenAI and Tavily are adapters;
  tests use fakes.
- web_search tool: <=5 results, truncated snippets, timeout, provider errors
  become "search unavailable". Enforce max 1 search per turn in code.
- ContextBuilder with configurable caps and trim priority; injects current
  date + timezone; numbered results [1..n].
- Citation validator: strip any [n] not in this turn's results; build sources
  only from backend results.
- AgentOrchestrator.runTurn() as an async generator of typed events
  (status | token | sources | complete | error), using AbortSignal.
- System prompt: untrusted search content, no invented dates/stats/memory,
  ask one clarifying question on ambiguous references.
Tests (mocked): every agent test listed in AGENTS.md.
Run tests, show output, commit.
```

**Exit check:** all nine agent tests pass without network access.

---

## Phase 4: SSE streaming + persistence

```
- POST /api/chat streams the orchestrator events over SSE.
- Persist the user message at turn start; persist the assistant message at the
  end with status complete|interrupted|error (partial text kept) in a
  transaction with updating conversations.updated_at; auto-title on first turn.
- Propagate client disconnect to the AbortController (OpenAI + Tavily).
- Record time-to-first-event, time-to-first-token, total, memory_ms, search_ms
  in search_metadata.
- Rate limit this route.
Tests: event order, progressive tokens, error propagation, abort persists
"interrupted", messages saved correctly.
Run tests, show output, commit.
```

**Exit check:** the `curl -N` SSE smoke test (with fake providers) streams tokens.

---

## Phase 5: Frontend

```
Build the client against the real API only (no mock data):
- owner_id generated once, stored in localStorage, sent as a header
- sidebar: new chat, backend search, date-grouped history, delete
- chat: welcome + 4 suggested prompts, SSE streaming hook, local-tz timestamps,
  citation cards (title, domain, URL, date), stop, retry, error states
- Enter / Shift+Enter, light/dark toggle, responsive
- no settings page, no non-functional buttons
Verify: npm run build for both workspaces. Manually exercise: new chat, reload
persistence, delete, stop mid-stream. Report exactly what you verified.
Commit.
```

**Exit check:** reload preserves chats; the stop button leaves an `interrupted` message.

---

## Phase 6: Eval + benchmarks + evidence gate

```
1. Create server/eval/*.json covering: general, time-sensitive, historical,
   follow-up, cross-conversation, unanswerable, search-failure, plus at least
   3 FTS-hostile cases (e.g. "which companies did we discuss?").
2. Build an eval runner (npm run eval) with mocked providers, reporting pass
   rates per category.
3. Apply decision 6: if cross-conversation cases fail, implement lazy
   background conversation_summaries, re-run the eval, and record BEFORE/AFTER
   numbers. If they pass, don't add summaries.
4. npm run bench: N live turns -> p50/p95 for TTFE, TTFT, total, memory_ms,
   search_ms -> docs/benchmarks.md. If there are no API keys here, say so and
   leave clear instructions instead of inventing numbers.
Run everything, show the output, commit.
```

**Exit check:** results are real and reproducible, and limitations are listed.

---

## Phase 7: Docs

```
Write DESIGN.md (decision-log style, per AGENTS.md) with all five Mermaid
diagrams, and README.md (full setup, API docs, deploy, limitations, screenshots
placeholder section). Every claim must match the code as it exists: re-read the
source before describing it. Use only measured benchmark numbers. Clearly
separate Implemented vs Planned. Put proactive recall in Future work.
Commit.
```

**Exit check:** a fresh clone can follow the README to a running app.

---

## Phase 8: Final audit

```
Audit against the Definition of done in AGENTS.md:
- clean clone, install, docker compose up, migrate, test, build
- grep the repo and git history for secrets
- confirm only one tool is exposed to the model
- confirm no doc claims exceed what is implemented
Fix anything failing. Produce the final report: features, structure, run
commands, env vars, tests run + results, benchmark numbers, known limitations.
```

---

## Submission checklist

- [ ] Repo is public (or the reviewer is invited) and `DESIGN.md` is in the root
- [ ] Clean git history with conventional commits
- [ ] Best 3 projects ranked, each with a link plus 1-2 lines on what it does and the hardest part
- [ ] 60-second video (script below)

### 60s video script

1. **0:00-0:10:** what it is, and the one-tool constraint.
2. **0:10-0:25:** memory is backend-owned context, not a tool; parallel retrieval means no router call, so lower latency.
3. **0:25-0:40:** FTS first, then the eval case that showed its limit (and the before/after numbers if summaries were added).
4. **0:40-0:52:** measured latency (p50/p95) and the citation validation guarantee.
5. **0:52-1:00:** what's next: proactive recall, built on timestamped memory, which is what minimi does.
