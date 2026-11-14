import { getPool, closePool } from '../src/db/pool.js';
import { randomUUID } from 'crypto';

async function runPhaseB() {
  const pool = getPool();
  console.log('--- PHASE B: DATABASE AND MIGRATION VERIFICATION ---');

  const testOwner = 'b0b0b0b0-0000-0000-0000-000000000001';
  const otherOwner = 'b0b0b0b0-0000-0000-0000-000000000002';

  try {
    // 1. Verify schema definition of messages.event_date
    const colRes = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'event_date';
    `);
    console.log('Column messages.event_date:', colRes.rows[0]);

    const idxRes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'messages' AND indexname = 'idx_messages_event_date';
    `);
    console.log('Index idx_messages_event_date:', idxRes.rows[0]);

    // 2. Insert test conversation with event_date = Nov 3, created_at = Nov 14
    const convId1 = randomUUID();
    await pool.query(
      `INSERT INTO conversations (id, owner_id, title, created_at, updated_at) 
       VALUES ($1, $2, 'Postgres vs MySQL Discussion', '2026-11-14T10:00:00Z', '2026-11-14T10:00:00Z')`,
      [convId1, testOwner]
    );

    const msgId1 = randomUUID();
    await pool.query(
      `INSERT INTO messages (id, conversation_id, role, content, status, created_at, event_date)
       VALUES ($1, $2, 'user', 'PostgreSQL vs MySQL scalability query', 'complete', '2026-11-14T10:00:00Z', '2026-11-03T16:00:00Z')`,
      [msgId1, convId1]
    );

    // Insert a second conversation on the same event date Nov 3
    const convId2 = randomUUID();
    await pool.query(
      `INSERT INTO conversations (id, owner_id, title, created_at, updated_at) 
       VALUES ($1, $2, 'Database Indexing Deep Dive', '2026-11-14T10:05:00Z', '2026-11-14T10:05:00Z')`,
      [convId2, testOwner]
    );

    const msgId2 = randomUUID();
    await pool.query(
      `INSERT INTO messages (id, conversation_id, role, content, status, created_at, event_date)
       VALUES ($1, $2, 'user', 'B-Tree vs GIN indexing trade-offs', 'complete', '2026-11-14T10:05:00Z', '2026-11-03T18:00:00Z')`,
      [msgId2, convId2]
    );

    // 3. Retrieve by event_date range [2026-11-03, 2026-11-04)
    const eventDateRes = await pool.query(
      `SELECT m.id, m.content, m.created_at, m.event_date, c.title
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.owner_id = $1
         AND (
           (m.created_at >= '2026-11-03T00:00:00Z' AND m.created_at < '2026-11-04T00:00:00Z')
           OR
           (m.event_date IS NOT NULL AND m.event_date >= '2026-11-03T00:00:00Z' AND m.event_date < '2026-11-04T00:00:00Z')
         )
       ORDER BY m.event_date ASC`,
      [testOwner]
    );
    console.log('Query by Nov 3 event_date returned count:', eventDateRes.rows.length);

    // 4. Retrieve by actual created_at range [2026-11-14, 2026-11-15)
    const createdAtRes = await pool.query(
      `SELECT m.id, m.content, m.created_at, m.event_date, c.title
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.owner_id = $1
         AND m.created_at >= '2026-11-14T00:00:00Z' AND m.created_at < '2026-11-15T00:00:00Z'
       ORDER BY m.created_at ASC`,
      [testOwner]
    );
    console.log('Query by Nov 14 created_at returned count:', createdAtRes.rows.length);

    // 5. Query unrelated date range Nov 5 [2026-11-05, 2026-11-06)
    const unrelatedRes = await pool.query(
      `SELECT m.id FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.owner_id = $1
         AND (
           (m.created_at >= '2026-11-05T00:00:00Z' AND m.created_at < '2026-11-06T00:00:00Z')
           OR
           (m.event_date IS NOT NULL AND m.event_date >= '2026-11-05T00:00:00Z' AND m.event_date < '2026-11-06T00:00:00Z')
         )`,
      [testOwner]
    );
    console.log('Query by unrelated date Nov 5 returned count:', unrelatedRes.rows.length);

    // 6. Test tenant isolation with different owner
    const otherOwnerRes = await pool.query(
      `SELECT m.id FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.owner_id = $1`,
      [otherOwner]
    );
    console.log('Other owner tenant isolation query count:', otherOwnerRes.rows.length);

    // Cleanup test records
    await pool.query(`DELETE FROM conversations WHERE owner_id = $1`, [testOwner]);
    console.log('Cleaned up test owner records.');

    const passed =
      colRes.rows.length > 0 &&
      colRes.rows[0].data_type === 'timestamp with time zone' &&
      idxRes.rows.length > 0 &&
      eventDateRes.rows.length === 2 &&
      createdAtRes.rows.length === 2 &&
      unrelatedRes.rows.length === 0 &&
      otherOwnerRes.rows.length === 0;

    console.log('PHASE B RESULT:', passed ? 'PASS' : 'FAIL');
  } finally {
    await closePool();
  }
}

runPhaseB().catch((err) => {
  console.error('Phase B error:', err);
  process.exit(1);
});
