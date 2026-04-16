// =============================================
// @relayon/sdk — Integration Tests
// Runs against a live API server
// =============================================

import * as crypto from 'crypto';
import { Pool } from 'pg';
import { Relayon, RelayonError, verifyWebhookSignature } from '../src';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://relayon:relayon@localhost:5432/relayon_que';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

const pool = new Pool({ connectionString: DATABASE_URL });

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) { passed++; console.log(`  PASS: ${message}`); }
  else { failed++; failures.push(message); console.log(`  FAIL: ${message}`); }
}

async function createTestApiKey(): Promise<{ rawKey: string; id: string }> {
  const randomPart = crypto.randomBytes(16).toString('hex');
  const rawKey = `rl_live_${randomPart}`;
  const prefix = randomPart.substring(0, 8);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const result = await pool.query<{ id: string }>(
    `INSERT INTO api_keys (user_id, key_prefix, key_hash, name)
     VALUES ('00000000-0000-0000-0000-000000000001', $1, $2, 'sdk-test')
     RETURNING id`,
    [prefix, keyHash]
  );
  return { rawKey, id: result.rows[0].id };
}

async function cleanDb(): Promise<void> {
  await pool.query('DELETE FROM dead_letter_jobs');
  await pool.query('DELETE FROM job_attempts');
  await pool.query('DELETE FROM job_wal');
  await pool.query('DELETE FROM jobs');
  await pool.query('DELETE FROM api_keys');
}

// --- Tests ---

async function testHealth(): Promise<void> {
  console.log('\n--- TEST 1: health() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const health = await client.health();
  assert(health.status === 'ok', 'Health status is ok');
  assert(typeof health.version === 'string', 'Version is string');
}

async function testCreateJob(): Promise<void> {
  console.log('\n--- TEST 2: createJob() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({
    endpoint: 'https://example.com/webhook',
    payload: { action: 'test' },
  });

  assert(!!job.id, 'Job ID assigned');
  assert(job.endpoint === 'https://example.com/webhook', 'Endpoint stored');
  assert(job.status === 'pending', 'Status is pending');
  assert(job.method === 'POST', 'Default method is POST');
  assert(job.priority === 3, 'Default priority is 3');
}

async function testCreateJobWithOptions(): Promise<void> {
  console.log('\n--- TEST 3: createJob() with all options ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({
    endpoint: 'https://example.com/webhook',
    method: 'PUT',
    payload: { data: 'test' },
    headers: { 'X-Custom': 'value' },
    webhook_secret: 'my-secret',
    delay: '10m',
    priority: 1,
    requires_approval: true,
    lock_timeout_ms: 600000,
    retry: { '5xx': { max_retries: 10 } },
  });

  assert(job.method === 'PUT', 'Method is PUT');
  assert(job.priority === 1, 'Priority is 1');
  assert(job.requires_approval === true, 'Requires approval');
  assert(job.approved_at === null, 'Not yet approved');
}

async function testCreateCronJob(): Promise<void> {
  console.log('\n--- TEST 4: createJob() with cron ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({
    endpoint: 'https://example.com/cron',
    cron: '0 2 * * *',
  });

  assert(job.cron_expression === '0 2 * * *', 'Cron expression stored');
}

async function testCreateMultiStepJob(): Promise<void> {
  console.log('\n--- TEST 5: createJob() multi-step ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({
    endpoint: 'https://example.com/step1',
    steps: [
      { name: 'validate', endpoint: 'https://example.com/step1' },
      { name: 'process', endpoint: 'https://example.com/step2' },
    ],
  });

  assert(job.steps !== null && job.steps.length === 2, '2 steps stored');
}

async function testGetJob(): Promise<void> {
  console.log('\n--- TEST 6: getJob() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const created = await client.createJob({ endpoint: 'https://example.com/get-test' });
  const fetched = await client.getJob(created.id);

  assert(fetched.id === created.id, 'Same job returned');
  assert(fetched.endpoint === 'https://example.com/get-test', 'Endpoint matches');
}

async function testGetJobNotFound(): Promise<void> {
  console.log('\n--- TEST 7: getJob() not found ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  try {
    await client.getJob('00000000-0000-0000-0000-000000000099');
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof RelayonError, 'Throws RelayonError');
    assert((err as RelayonError).statusCode === 404, 'Status code is 404');
    assert((err as RelayonError).code === 'NOT_FOUND', 'Code is NOT_FOUND');
  }
}

async function testListJobs(): Promise<void> {
  console.log('\n--- TEST 8: listJobs() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  await client.createJob({ endpoint: 'https://example.com/list1' });
  await client.createJob({ endpoint: 'https://example.com/list2' });
  await client.createJob({ endpoint: 'https://example.com/list3' });

  const list = await client.listJobs();
  assert(list.data.length === 3, '3 jobs returned');
  assert(list.pagination.total === 3, 'Total is 3');

  const filtered = await client.listJobs({ status: 'pending', limit: 2 });
  assert(filtered.data.length === 2, 'Limit=2 returns 2');
  assert(filtered.pagination.has_more === true, 'has_more is true');
}

async function testCancelJob(): Promise<void> {
  console.log('\n--- TEST 9: cancelJob() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({ endpoint: 'https://example.com/cancel' });
  const cancelled = await client.cancelJob(job.id);

  assert(cancelled.status === 'cancelled', 'Status is cancelled');
}

async function testPauseResume(): Promise<void> {
  console.log('\n--- TEST 10: pauseJob() + resumeJob() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({ endpoint: 'https://example.com/pause' });
  const paused = await client.pauseJob(job.id);
  assert(paused.status === 'paused', 'Status is paused');

  const resumed = await client.resumeJob(job.id);
  assert(resumed.status === 'pending', 'Status is pending after resume');
}

async function testApproveJob(): Promise<void> {
  console.log('\n--- TEST 11: approveJob() ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({
    endpoint: 'https://example.com/approve',
    requires_approval: true,
  });

  assert(job.approved_at === null, 'Not approved initially');

  const approved = await client.approveJob(job.id);
  assert(approved.approved_at !== null, 'approved_at is set');
}

async function testDependency(): Promise<void> {
  console.log('\n--- TEST 12: createJob() with depends_on ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const parent = await client.createJob({ endpoint: 'https://example.com/parent' });
  const child = await client.createJob({
    endpoint: 'https://example.com/child',
    depends_on: parent.id,
  });

  assert(child.depends_on === parent.id, 'depends_on set correctly');
}

async function testValidationError(): Promise<void> {
  console.log('\n--- TEST 13: Validation errors ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  try {
    await client.createJob({ endpoint: 'not-a-url' });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof RelayonError, 'Throws RelayonError');
    assert((err as RelayonError).statusCode === 400, 'Status code is 400');
    assert((err as RelayonError).code === 'VALIDATION_ERROR', 'Code is VALIDATION_ERROR');
  }
}

async function testAuthError(): Promise<void> {
  console.log('\n--- TEST 14: Auth error ---');
  const client = new Relayon({ apiKey: 'rl_live_invalid_key_that_does_not_exist', baseUrl: API_BASE });

  try {
    await client.listJobs();
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof RelayonError, 'Throws RelayonError');
    assert((err as RelayonError).statusCode === 401, 'Status code is 401');
  }
}

async function testConflictError(): Promise<void> {
  console.log('\n--- TEST 15: Conflict error ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const job = await client.createJob({ endpoint: 'https://example.com/conflict' });
  await client.cancelJob(job.id);

  try {
    await client.cancelJob(job.id);
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof RelayonError, 'Throws RelayonError');
    assert((err as RelayonError).statusCode === 409, 'Status code is 409');
    assert((err as RelayonError).code === 'CONFLICT', 'Code is CONFLICT');
  }
}

async function testDLQ(): Promise<void> {
  console.log('\n--- TEST 16: listDLQ() + replayDLQ() ---');
  const { rawKey, id: apiKeyId } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  // Create a job and manually fail it + add DLQ entry
  const job = await client.createJob({ endpoint: 'https://example.com/dlq' });
  await pool.query("UPDATE jobs SET status = 'failed', completed_at = now() WHERE id = $1", [job.id]);
  const dlq = await pool.query<{ id: string }>(
    `INSERT INTO dead_letter_jobs (original_job_id, api_key_id, user_id, endpoint, failure_reason, total_attempts)
     VALUES ($1, $2, '00000000-0000-0000-0000-000000000001', 'https://example.com/dlq', 'retries_exhausted', 3)
     RETURNING id`,
    [job.id, apiKeyId]
  );

  const list = await client.listDLQ();
  assert(list.data.length >= 1, 'DLQ has entries');

  const replayed = await client.replayDLQ(dlq.rows[0].id);
  assert(!!replayed.replayed_job_id, 'Replay returned new job ID');
  assert(replayed.dlq_id === dlq.rows[0].id, 'DLQ ID matches');
}

async function testWebhookVerification(): Promise<void> {
  console.log('\n--- TEST 17: verifyWebhookSignature() ---');
  const secret = 'test-webhook-secret';
  const body = '{"action":"test"}';
  const timestamp = Math.floor(Date.now() / 1000);

  const hmac = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const signature = `t=${timestamp},sha256=${hmac}`;

  assert(verifyWebhookSignature(body, signature, secret) === true, 'Valid signature accepted');
  assert(verifyWebhookSignature(body, signature, 'wrong-secret') === false, 'Wrong secret rejected');
  assert(verifyWebhookSignature('tampered', signature, secret) === false, 'Tampered body rejected');

  // Old timestamp
  const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
  const oldHmac = crypto.createHmac('sha256', secret)
    .update(`${oldTimestamp}.${body}`)
    .digest('hex');
  const oldSig = `t=${oldTimestamp},sha256=${oldHmac}`;
  assert(verifyWebhookSignature(body, oldSig, secret) === false, 'Expired signature rejected');
}

async function testRunAtWithDate(): Promise<void> {
  console.log('\n--- TEST 18: createJob() with Date run_at ---');
  const { rawKey } = await createTestApiKey();
  const client = new Relayon({ apiKey: rawKey, baseUrl: API_BASE });

  const future = new Date(Date.now() + 3600000);
  const job = await client.createJob({
    endpoint: 'https://example.com/date-test',
    run_at: future,
  });

  const runAt = new Date(job.run_at).getTime();
  assert(Math.abs(runAt - future.getTime()) < 1000, 'run_at matches Date object');
}

// --- Runner ---

async function main(): Promise<void> {
  console.log('=============================================');
  console.log('@relayon/sdk — Integration Tests');
  console.log(`API: ${API_BASE}`);
  console.log('=============================================');

  console.log('\nCleaning database...');
  await cleanDb();

  try {
    await testHealth();
    await testCreateJob();
    await testCreateJobWithOptions();
    await testCreateCronJob();
    await testCreateMultiStepJob();
    await testGetJob();
    await testGetJobNotFound();
    await testListJobs();
    await testCancelJob();
    await testPauseResume();
    await testApproveJob();
    await testDependency();
    await testValidationError();
    await testAuthError();
    await testConflictError();
    await testDLQ();
    await testWebhookVerification();
    await testRunAtWithDate();
  } catch (err) {
    console.error('\nTest runner error:', err);
  }

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failures.length > 0) {
    console.log('\nFailed:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('=============================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
