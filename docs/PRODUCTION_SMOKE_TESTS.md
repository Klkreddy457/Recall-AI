# Recall AI - Production Database Smoke Tests Catalog

This catalog outlines executable smoke tests designed to verify database connectivity, data persistence, schema migrations, and error handling across local, Neon PostgreSQL, and deployed Vercel environments.

---

## 1. Quick Verification Commands

### Run Migration Runner
```bash
npm run migrate --workspace=server
```
**Expected Output:**
```text
Database is up to date. No new migrations.
```

### Run Automated Live Neon Verification
```bash
npx tsx server/scripts/production-verification.ts
```

### Run Vitest Server Suite (including DB resilience & migrations)
```bash
npm run test --workspace=server
```
**Expected Result:**
```text
Test Files  9 passed (9)
     Tests  53 passed (53)
```

---

## 2. API Smoke Tests (HTTP Endpoints)

### Smoke Test 1: Health Check (Connected vs. Disconnected)

#### Connected to Neon PostgreSQL (HTTP 200 OK):
```bash
curl -i https://recall-ai-app-six.vercel.app/api/health
```
**Expected Response:**
```http
HTTP/2 200 OK
content-type: application/json; charset=utf-8

{
  "status": "ok",
  "db": "connected",
  "connected": true,
  "timestamp": "2026-11-14T02:20:00.000Z"
}
```

#### Disconnected / Missing DATABASE_URL (HTTP 503 Service Unavailable):
```bash
curl -i https://recall-ai-app-six.vercel.app/api/health
```
**Expected Response:**
```http
HTTP/2 503 Service Unavailable
content-type: application/json; charset=utf-8

{
  "status": "error",
  "db": "disconnected",
  "connected": false,
  "timestamp": "2026-11-14T02:21:00.000Z"
}
```

---

### Smoke Test 2: Create Conversation & Verify Persistence

```bash
curl -i -X POST https://recall-ai-app-six.vercel.app/api/conversations \
  -H "Content-Type: application/json" \
  -H "x-owner-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title": "Production Smoke Test Conversation"}'
```
**Expected Response:**
```http
HTTP/2 201 Created
content-type: application/json; charset=utf-8

{
  "conversation": {
    "id": "<new-uuid>",
    "owner_id": "00000000-0000-0000-0000-000000000001",
    "title": "Production Smoke Test Conversation",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

### Smoke Test 3: List Conversations (Tenant Isolated)

```bash
curl -i https://recall-ai-app-six.vercel.app/api/conversations \
  -H "x-owner-id: 00000000-0000-0000-0000-000000000001"
```
**Expected Response:**
```http
HTTP/2 200 OK
content-type: application/json; charset=utf-8

{
  "conversations": [
    {
      "id": "<new-uuid>",
      "owner_id": "00000000-0000-0000-0000-000000000001",
      "title": "Production Smoke Test Conversation"
    }
  ]
}
```

---

### Smoke Test 4: Tenant Isolation Enforcement

Query using a different `x-owner-id` header (`00000000-0000-0000-0000-000000000002`):
```bash
curl -i https://recall-ai-app-six.vercel.app/api/conversations \
  -H "x-owner-id: 00000000-0000-0000-0000-000000000002"
```
**Expected Response:**
```http
HTTP/2 200 OK
content-type: application/json; charset=utf-8

{
  "conversations": []
}
```
*(Confirms that Owner 2 receives 0 conversations belonging to Owner 1).*

---

### Smoke Test 5: Full-Text Search and Trigger Verification (Direct SQL)

Connect to Neon with psql or the connection pool:
```sql
-- 1. Insert conversation summary with entities
INSERT INTO conversation_summaries (conversation_id, summary, key_entities)
VALUES (
  '<conversation-uuid>', 
  'Discussion regarding PostgreSQL query planning and execution optimization', 
  ARRAY['postgres', 'query-plan', 'database']
)
RETURNING id, summary_tsv;

-- 2. Test full-text matching against summary_tsv
SELECT id, summary, summary_tsv @@ plainto_tsquery('english', 'database') as matched
FROM conversation_summaries;
```
**Expected Output:**
- `summary_tsv` contains: `'databas':7 'discuss':1 'execut':6 'optim':8 'plan':5 'postgr':3 'postgresql':2 'queri':4`
- `matched` column: `true`

---

## 3. Environment Variable Setup for Vercel Deployment

To link the deployed Vercel application with the Neon production PostgreSQL branch:

1. Open the **Vercel Dashboard** → Select project **recall-ai-app**.
2. Navigate to **Settings** → **Environment Variables**.
3. Add the following variables:
   - `DATABASE_URL`: `postgresql://neondb_owner:****@ep-small-rain-azkilk1o-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - `DATABASE_SSL`: `true`
4. Trigger a deployment or push a commit to redeploy.
5. Verify `GET https://recall-ai-app-six.vercel.app/api/health` returns `HTTP 200 OK` with `"connected": true`.

